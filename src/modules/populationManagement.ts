import { isCenterRoom, isKeeperRoom as isKeeperRoom } from './data';
import { getResourceBoostsAvailable } from './labManagement';
import { posFromMem } from './data';
import { roomNeedsCoreStructures } from './roomDesign';

const BODY_TO_BOOST_MAP: Record<BoostType, BodyPartConstant> = {
    1: ATTACK,
    2: RANGED_ATTACK,
    3: HEAL,
    4: WORK,
    5: WORK,
    6: WORK,
    7: WORK,
    8: MOVE,
    9: CARRY,
    10: TOUGH,
};

const ROLE_TAG_MAP: { [key in Role]: string } = {
    [Role.CLAIMER]: 'cl',
    [Role.COLONIZER]: 'col',
    [Role.DISTRIBUTOR]: 'd',
    [Role.GATHERER]: 'g',
    [Role.WORKER]: 'w',
    [Role.GO]: 'go',
    [Role.INTERSHARD_TRAVELLER]: 'i',
    [Role.MANAGER]: 'mg',
    [Role.MINERAL_MINER]: 'mm',
    [Role.MINER]: 'm',
    [Role.OPERATIVE]: 'o',
    [Role.PROTECTOR]: 'p',
    [Role.RAMPART_PROTECTOR]: 'rp',
    [Role.RESERVER]: 'rs',
    [Role.SCOUT]: 'sc',
    [Role.SQUAD_ATTACKER]: 'a',
    [Role.TRANSPORTER]: 't',
    [Role.UPGRADER]: 'u',
    [Role.REMOTE_MINER]: 'rm',
    [Role.KEEPER_EXTERMINATOR]: 'e',
    [Role.REMOTE_MINERAL_MINER]: 'rmm',
};

export class PopulationManagement {
    static spawnWorker(spawn: StructureSpawn): ScreepsReturnCode {
        let workers = spawn.room.creeps.filter((creep) => creep.memory.role === Role.WORKER);
        let hasUpgrader = spawn.room.creeps.some((c) => c.memory.role === Role.UPGRADER);
        let roomNeedsConstruction =
            spawn.room.memory.repairQueue.length + spawn.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0 || spawn.room.memory.needsWallRepair;

        let workerCount = workers.length + (hasUpgrader ? 1 : 0);

        let options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.WORKER,
            },
        };

        let canSupportAnotherWorker = workerCount < spawn.room.workerCapacity;

        let spawnUpgrader =
            canSupportAnotherWorker &&
            !spawn.room.find(FIND_NUKES).length &&
            !hasUpgrader &&
            (!roomNeedsConstruction || workers.length > 0) &&
            !roomNeedsCoreStructures(spawn.room);

        const WORKER_PART_BLOCK = [WORK, CARRY, MOVE];
        let creepLevelCap = 15;
        if (spawnUpgrader) {
            options.memory.role = Role.UPGRADER;
            options.boosts = [BoostType.UPGRADE];
            let result: ScreepsReturnCode;

            if (spawn.room.upgraderLink) {
                let body = this.createPartsArray([WORK, WORK, WORK, CARRY, MOVE, MOVE], spawn.room.energyCapacityAvailable, 5);
                result = spawn.smartSpawn(body, this.generateName(options.memory.role, spawn.name), options);
            } else {
                result = spawn.spawnMax([WORK, CARRY, MOVE], this.generateName(options.memory.role, spawn.name), options);
            }

            return result;
        } else if (canSupportAnotherWorker) {
            let result = spawn.spawnMax(WORKER_PART_BLOCK, this.generateName(options.memory.role, spawn.name), options, creepLevelCap);
            return result;
        } else {
            //check to see if there are any creeps to replace w/ stronger models
            let maxSize = this.createPartsArray(WORKER_PART_BLOCK, spawn.room.energyCapacityAvailable, creepLevelCap).length;
            let creepToReplace = workers.find((creep) => creep.getActiveBodyparts(WORK) < maxSize / 3);
            if (creepToReplace) {
                let result = spawn.spawnMax(WORKER_PART_BLOCK, this.generateName(options.memory.role, spawn.name), options, creepLevelCap);
                if (result === OK) {
                    creepToReplace.suicide();
                }
                return result;
            }
        }
    }

    //find the number of workers a phase-two room can support
    static calculateWorkerCapacity(room: Room): number {
        //a "cycle" is 300 ticks - the amount of time a source takes to recharge
        const CYCLE_LENGTH = 300;

        //base values
        const sourceCount = room.find(FIND_SOURCES).length;
        const energyCapacity = room.energyCapacityAvailable;

        // avg distance from storagepos to sources
        let energySourceDistance = room.memory.energyDistance ?? 25;

        // distance from storagepos to controller
        let controllerDistance = room.memory.controllerDistance ?? 25;

        let travelDistance = room.storage ? controllerDistance : controllerDistance + energySourceDistance;

        let sourceIncomePerCycle = sourceCount * 3000;
        let remoteIncomePerCycle = 0; //define this once we get remote harvesting working

        let totalIncomePerCycle = sourceIncomePerCycle + remoteIncomePerCycle;

        //cost to create [WORK, CARRY, MOVE] is 200 energy - the largest a creep can be is 50 parts - stop at 45
        let maxPartsBlockPerCreep = Math.min(Math.floor(energyCapacity / 200), 15);

        let energyConsumedPerTrip = 50 * maxPartsBlockPerCreep;

        // 50 carry : 1 work
        let ticksTakenPerTrip = 50 + travelDistance;
        let tripsPerCycle = CYCLE_LENGTH / ticksTakenPerTrip;

        //assuming there are no construction / maintenance jobs, all workers should be upgrading
        let upgadeWorkCostPerCyclePerCreep = energyConsumedPerTrip * tripsPerCycle;

        let spawnCost = maxPartsBlockPerCreep * 200;

        //creeps live for 1500 ticks -> 5 cycles
        let spawnCostPerCyclePerCreep = spawnCost / 5;
        let energyExpenditurePerCyclePerCreep = spawnCostPerCyclePerCreep + upgadeWorkCostPerCyclePerCreep;

        let creepCapacity = Math.max(Math.floor(totalIncomePerCycle / energyExpenditurePerCyclePerCreep), 1);

        switch (room.energyStatus) {
            case EnergyStatus.CRITICAL:
                return 0;
            case EnergyStatus.RECOVERING:
                creepCapacity = Math.ceil(creepCapacity / 2);
                break;
            case EnergyStatus.STABLE:
                break;
            case EnergyStatus.SURPLUS:
                creepCapacity *= 2;
                break;
            case EnergyStatus.OVERFLOW:
                creepCapacity *= 4;
                break;
            //room has no storage
            default:
                let hasStartupEnergy =
                    room
                        .find(FIND_STRUCTURES)
                        .filter(
                            (struct) =>
                                (struct.structureType === STRUCTURE_STORAGE || struct.structureType === STRUCTURE_TERMINAL) &&
                                struct.store.energy > 200000
                        ).length > 0;
                if (hasStartupEnergy) {
                    creepCapacity *= 4;
                }
        }

        return creepCapacity;
    }

    static needsMiner(room: Room): boolean {
        let roomNeedsMiner = Object.values(room.memory.miningAssignments).some((assignment) => assignment === AssignmentStatus.UNASSIGNED);
        // if (!roomNeedsMiner) {
        //     // Check for TTL
        //     roomNeedsMiner = room.creeps.some(
        //         (creep) =>
        //             creep.memory.role === Role.MINER &&
        //             creep.memory.room === room.name &&
        //             !creep.memory.hasTTLReplacement &&
        //             creep.ticksToLive <
        //                 PopulationManagement.getMinerBody(posFromMem(creep.memory.assignment), room.energyCapacityAvailable).length * 3
        //     );
        // }
        return roomNeedsMiner;
    }

    static getMinerBody(miningPos: RoomPosition, energyCapacityAvailable: number): (WORK | MOVE | CARRY)[] {
        let minerBody: (WORK | MOVE | CARRY)[];

        if (energyCapacityAvailable >= 650) {
            minerBody = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE];
        } else if (energyCapacityAvailable >= 550) {
            minerBody = [WORK, WORK, WORK, WORK, WORK, MOVE];
        } else if (energyCapacityAvailable >= 450) {
            minerBody = [WORK, WORK, WORK, WORK, MOVE];
        } else if (energyCapacityAvailable >= 350) {
            minerBody = [WORK, WORK, WORK, MOVE];
        } else {
            minerBody = [WORK, WORK, MOVE];
        }

        let link = miningPos.findInRange(FIND_MY_STRUCTURES, 1).find((s) => s.structureType === STRUCTURE_LINK);
        if (link) {
            minerBody.unshift(CARRY);
        }
        return minerBody;
    }

    static spawnMiner(spawn: StructureSpawn): ScreepsReturnCode {
        let assigmentKeys = Object.keys(spawn.room.memory.miningAssignments);
        let assigment = assigmentKeys.find((pos) => spawn.room.memory.miningAssignments[pos] === AssignmentStatus.UNASSIGNED);
        let currentMiner: Creep;
        // if (!assigment) {
        //     // Check for TTL
        //     currentMiner = spawn.room.creeps.find(
        //         (creep) =>
        //             creep.memory.role === Role.MINER &&
        //             creep.memory.room === spawn.room.name &&
        //             creep.ticksToLive <
        //                 PopulationManagement.getMinerBody(posFromMem(creep.memory.assignment), spawn.room.energyCapacityAvailable).length * 3
        //     );
        //     assigment = currentMiner?.memory.assignment;
        // }

        let options: SpawnOptions = {
            memory: {
                assignment: assigment,
                room: spawn.room.name,
                role: Role.MINER,
            },
        };

        let assigmentPos = posFromMem(assigment);
        let link = assigmentPos.findInRange(FIND_MY_STRUCTURES, 1).find((s) => s.structureType === STRUCTURE_LINK) as StructureLink;
        if (link) {
            options.memory.link = link.id;
        }

        let name = this.generateName(options.memory.role, spawn.name);

        let result = spawn.smartSpawn(PopulationManagement.getMinerBody(assigmentPos, spawn.room.energyCapacityAvailable), name, options);
        if (result === OK) {
            if (currentMiner) {
                currentMiner.memory.hasTTLReplacement = true;
            }
            spawn.room.memory.miningAssignments[assigment] = name;
        } else if (
            result === ERR_NOT_ENOUGH_ENERGY &&
            !spawn.room.find(FIND_MY_CREEPS).filter((creep) => creep.memory.role === Role.MINER).length &&
            (!spawn.room.storage || spawn.room.storage?.store[RESOURCE_ENERGY] < 1000)
        ) {
            let emergencyMinerBody = [WORK, WORK, MOVE];
            result = spawn.smartSpawn(emergencyMinerBody, name, options);
            if (result === OK) {
                if (currentMiner) {
                    currentMiner.memory.hasTTLReplacement = true;
                }
                spawn.room.memory.miningAssignments[assigment] = name;
            }
        }

        return result;
    }

    static findRemoteMinerNeed(room: Room): string {
        return room.memory.remoteMiningRooms.find(
            (remoteRoom) =>
                Memory.roomData[remoteRoom].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
                Memory.remoteData[remoteRoom].threatLevel !== RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
                Memory.remoteData[remoteRoom].reservationState !== RemoteRoomReservationStatus.ENEMY &&
                Memory.remoteData[remoteRoom].miner === AssignmentStatus.UNASSIGNED
        );
    }

    static spawnRemoteMiner(spawn: StructureSpawn, remoteRoomName: string): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                assignment: remoteRoomName,
                room: spawn.room.name,
                role: Role.REMOTE_MINER,
                currentTaskPriority: Priority.HIGH,
            },
        };

        let workNeeded = this.calculateRemoteMinerWorkNeeded(remoteRoomName);
        let work = [];
        let move = [];
        let energyLeft = spawn.room.energyCapacityAvailable - 100;
        let needMove = 1;
        while (work.length < workNeeded && energyLeft >= (needMove === 1 ? 150 : 100)) {
            work.push(WORK);
            energyLeft -= 100;
            needMove++;
            if (needMove === 2) {
                move.push(MOVE);
                energyLeft -= 50;
                needMove = 0;
            }
        }

        let minerBody = [...work, ...move, CARRY, MOVE];
        let name = this.generateName(options.memory.role, spawn.name);

        let result = spawn.smartSpawn(minerBody, name, options);
        if (result === OK) {
            Memory.remoteData[remoteRoomName].miner = name;
        }

        return result;
    }

    static findGathererNeed(room: Room): string {
        return room.memory.remoteMiningRooms.find(
            (remoteRoom) =>
                Memory.roomData[remoteRoom].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
                Memory.remoteData[remoteRoom].threatLevel !== RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
                Memory.remoteData[remoteRoom].reservationState !== RemoteRoomReservationStatus.ENEMY &&
                (Memory.remoteData[remoteRoom].gatherer === AssignmentStatus.UNASSIGNED ||
                    Memory.remoteData[remoteRoom].gathererSK === AssignmentStatus.UNASSIGNED)
        );
    }

    static spawnGatherer(spawn: StructureSpawn, remoteRoomName: string): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                assignment: remoteRoomName,
                room: spawn.room.name,
                role: Role.GATHERER,
            },
        };

        let name = this.generateName(options.memory.role, spawn.name);
        let PARTS = PopulationManagement.createPartsArray([CARRY, CARRY, CARRY, CARRY, MOVE], spawn.room.energyCapacityAvailable - 350, 9);
        PARTS.push(WORK, WORK, CARRY, CARRY, MOVE);
        let result = spawn.smartSpawn(PARTS, name, options);

        if (result === OK) {
            if (Memory.remoteData[remoteRoomName].gatherer === AssignmentStatus.UNASSIGNED) {
                Memory.remoteData[remoteRoomName].gatherer = name;
            } else {
                Memory.remoteData[remoteRoomName].gathererSK = name;
            }
        }

        return result;
    }

    static findReserverNeed(room: Room): string {
        return Object.values(room.memory.remoteMiningRooms).find(
            (remoteRoom) =>
                Memory.roomData[remoteRoom].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
                Memory.remoteData[remoteRoom].threatLevel !== RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
                Memory.remoteData[remoteRoom].reserver === AssignmentStatus.UNASSIGNED
        );
    }

    static spawnReserver(spawn: StructureSpawn, remoteRoomName: string): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                assignment: remoteRoomName,
                room: spawn.room.name,
                role: Role.RESERVER,
            },
        };

        let maxSize = 5;
        if (Memory.remoteData[remoteRoomName].reservationState === RemoteRoomReservationStatus.STABLE) {
            maxSize = 1;
        }

        const PARTS = [CLAIM, MOVE];
        let name = this.generateName(options.memory.role, spawn.name);
        let result = spawn.spawnMax(PARTS, name, options, maxSize);

        if (result === OK) {
            Memory.remoteData[remoteRoomName].reserver = name;
        }

        return result;
    }

    static createPartsArray(partsBlock: BodyPartConstant[], energyCapacityAvailable: number, levelCap: number = 15): BodyPartConstant[] {
        let partsBlockCost = partsBlock.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);
        let partsArray = [];

        for (let i = 0; i < Math.floor(energyCapacityAvailable / partsBlockCost) && (i + 1) * partsBlock.length <= 50 && i < levelCap; i++) {
            partsArray = partsArray.concat(partsBlock);
        }

        return partsArray;
    }

    /**
     * Create a creep body until damage needed is reached up to max body size. It will boost all creep parts if possible.
     * Supports: ATTACK, RANGED_ATTACK, HEAL, TOUGH, MOVE
     *
     * @param room room which will be used to spawn creep
     * @param parts Unique Body parts (method will determine how much you need of each for you)
     * @param damageNeeded damage creep should be able to output
     * @param opts normal spawnOptions
     * @returns Creep Body Part Array
     */
    public static createDynamicCreepBody(room: Room, parts: BodyPartConstant[], damageNeeded: number, healNeeded: number, opts?: SpawnOptions) {
        const getSortValue = (part: BodyPartConstant): number => (part === MOVE ? 2 : part === TOUGH ? 1 : 0);
        parts = parts.filter((part, index) => parts.indexOf(part) === index).sort((a, b) => getSortValue(b) - getSortValue(a));
        let energyAvailable = room.energyCapacityAvailable;
        let hasEnergyLeft = true;
        let partsArray = [];

        const needed: BodyPartsNeeded = { damage: damageNeeded, move: 0, heal: 0, tough: 0, calculatedTough: false, boostedTough: false };
        if (parts.some((part) => part === HEAL)) {
            needed.heal = healNeeded;
        }
        // ToughNeeded is calculated after knowing which boost is used
        if (parts.some((part) => part === TOUGH) && healNeeded > 0) {
            needed.tough = 1;
        }

        if (opts?.boosts) {
            var boostMap = getResourceBoostsAvailable(room, Array.from(opts.boosts));
        }

        while (hasEnergyLeft && partsArray.length < 50 && (needed.damage > 0 || needed.heal > 0 || needed.tough > 0 || needed.move > 0)) {
            parts = parts.filter(
                (part) =>
                    ((part === ATTACK || part === RANGED_ATTACK) && needed.damage > 0) ||
                    (part === HEAL && needed.heal > 0) ||
                    (part === TOUGH && needed.tough > 0) ||
                    part === MOVE
            );
            parts.forEach((part) => {
                if (partsArray.length === 50) {
                    return;
                }
                if (energyAvailable < BODYPART_COST[part]) {
                    hasEnergyLeft = false;
                    return; // no more energy
                }

                if (part !== MOVE && needed.move > -1) {
                    return; // First add a MOVE part
                }
                if (part === MOVE && needed.move < 0) {
                    return; // Move not currently needed
                }

                if (part !== MOVE) {
                    needed.move++;
                }

                let boostFound = false;
                if (opts?.boosts?.length) {
                    opts.boosts
                        .filter((boostType) => part === BODY_TO_BOOST_MAP[boostType])
                        .forEach((boostType) => {
                            let boostsAvailableCount = boostMap[boostType]?.map((boost) => boost.amount).reduce((sum, next) => sum + next) ?? 0;
                            if (boostsAvailableCount) {
                                const nextAvailableBoostResource = boostMap[boostType].filter((boost) => boost.amount > 0)[0].resource;
                                boostMap[nextAvailableBoostResource] -= 1;
                                const tierBoost =
                                    nextAvailableBoostResource.length > 2 ? nextAvailableBoostResource.length - 1 : nextAvailableBoostResource.length;
                                this.updateNeededValues(part, needed, tierBoost);
                                boostFound = true;
                            }
                        });
                }
                if (!boostFound) {
                    this.updateNeededValues(part, needed);
                }
                if (part === TOUGH && !needed.boostedTough) {
                    // Do not allow nonBoosted TOUGH parts
                    needed.tough = 0;
                    return;
                }
                energyAvailable -= BODYPART_COST[part];
                partsArray.push(part);
            });
        }

        return partsArray;
    }

    /**
     * Create a creep body with parts in the same ratio as provided in the parts Array except that it will only
     */
    public static createCreepBodyWithDynamicMove(room: Room, parts: BodyPartConstant[], partsCap: number = 50, opts?: SpawnOptions) {
        const getSortValue = (part: BodyPartConstant): number => (part === MOVE ? 2 : part === CARRY ? 1 : 0);
        parts = parts.sort((a, b) => getSortValue(b) - getSortValue(a));
        let energyAvailable = room.energyCapacityAvailable;
        let hasEnergyLeft = true;
        let partsArray = [];
        if (partsCap > 50) {
            partsCap = 50;
        }
        const partRatio = {};
        for (const part of parts) {
            if (partRatio[part]) {
                partRatio[part] += 1;
            } else {
                partRatio[part] = 1;
            }
        }

        if (opts?.boosts) {
            var boostMap = getResourceBoostsAvailable(room, Array.from(opts.boosts));
        }

        let move = 0;

        while (hasEnergyLeft && partsArray.length < partsCap) {
            if (partsCap - partsArray.length === 1 && move === 0) {
                break;
            }
            parts.forEach((part) => {
                if (partsArray.length === 50) {
                    return;
                }
                if (energyAvailable < BODYPART_COST[part]) {
                    hasEnergyLeft = false;
                    return; // no more energy
                }

                if (part !== MOVE && move > -1) {
                    return; // First add a MOVE part
                }
                if (part === MOVE && move < 0) {
                    return; // Move not currently needed
                }

                if (part !== MOVE) {
                    move++;
                }

                let boostFound = false;
                if (opts?.boosts?.length) {
                    opts.boosts
                        .filter((boostType) => part === BODY_TO_BOOST_MAP[boostType])
                        .forEach((boostType) => {
                            const boostsAvailableCount = boostMap[boostType]?.map((boost) => boost.amount).reduce((sum, next) => sum + next) ?? 0;
                            if (boostsAvailableCount) {
                                const nextAvailableBoostResource = boostMap[boostType].filter((boost) => boost.amount > 0)[0].resource;
                                boostMap[nextAvailableBoostResource] -= 1;
                                const tierBoost =
                                    nextAvailableBoostResource.length > 2 ? nextAvailableBoostResource.length - 1 : nextAvailableBoostResource.length;
                                move -= this.getMove(part, tierBoost) * Math.ceil((parts.length - partRatio[MOVE]) / partRatio[MOVE]);
                                boostFound = true;
                            }
                        });
                }
                if (!boostFound) {
                    move -= this.getMove(part, 1) * Math.ceil((parts.length - partRatio[MOVE]) / partRatio[MOVE]);
                }
                energyAvailable -= BODYPART_COST[part];
                partsArray.push(part);
            });
        }

        return partsArray;
    }

    private static updateNeededValues(part: BodyPartConstant, needed: BodyPartsNeeded, tierBoost: number = 1) {
        needed.damage -= this.getDamage(part, tierBoost);
        needed.heal -= this.getHeal(part, tierBoost);
        needed.move -= this.getMove(part, tierBoost);
        if (part === TOUGH) {
            if (!needed.calculatedTough) {
                needed.calculatedTough = true;
                needed.boostedTough = tierBoost > 1;
                needed.heal *= this.getTough(part, tierBoost);
                needed.tough = Math.ceil(needed.heal / 100);
            }
            needed.tough--;
        }
    }

    private static getDamage(part: BodyPartConstant, boostTier: number) {
        if (part === RANGED_ATTACK) {
            return RANGED_ATTACK_POWER * boostTier;
        } else if (part === ATTACK) {
            return ATTACK_POWER * boostTier;
        }
        return 0;
    }

    private static getHeal(part: BodyPartConstant, boostTier: number) {
        if (part === HEAL) {
            return HEAL_POWER * boostTier;
        }
        return 0;
    }

    private static getTough(part: BodyPartConstant, boostTier: number) {
        return boostTier === 2 ? 0.7 : boostTier === 3 ? 0.5 : boostTier === 4 ? 0.3 : 1;
    }

    private static getMove(part: BodyPartConstant, boostTier: number) {
        if (part === MOVE) {
            return 1 * boostTier;
        }
        return 0;
    }

    static spawnAssignedCreep(spawn: StructureSpawn, assignment: SpawnAssignment): ScreepsReturnCode {
        let options: SpawnOptions = {
            ...assignment.spawnOpts,
        };

        let result = spawn.smartSpawn(assignment.body, this.generateName(options.memory.role, spawn.name), options);
        if (result === OK) {
            const ASSIGNMENT_INDEX = Memory.spawnAssignments.findIndex((a) => a === assignment);
            Memory.spawnAssignments.splice(ASSIGNMENT_INDEX, 1);
        }

        return result;
    }

    static spawnDistributor(spawn: StructureSpawn): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.DISTRIBUTOR,
            },
        };

        const PARTS = [CARRY, CARRY, MOVE];
        let result = spawn.spawnMax(PARTS, this.generateName(options.memory.role, spawn.name), options, 10);

        if (result === ERR_NOT_ENOUGH_ENERGY) {
            result = spawn.spawnFirst(PARTS, this.generateName(options.memory.role, spawn.name), options, 10);
        }

        return result;
    }

    static getAdditionalUpgraderCount(room: Room): number {
        let storedEnergy = room.storage?.store[RESOURCE_ENERGY];

        if (storedEnergy > 400000) {
            return 2;
        } else if (storedEnergy > 200000) {
            return 1;
        }
        return 0;
    }

    static generateName(role: Role, spawnName: string): string {
        return ROLE_TAG_MAP[role] + Game.shard.name.slice(-1) + spawnName.substring(5) + Game.time.toString().slice(-4);
    }

    // spawn the largest creep possible as calculated with spawn.energyAvailable
    static spawnFirst(
        spawn: StructureSpawn,
        partsBlock: BodyPartConstant[],
        name: string,
        opts?: SpawnOptions,
        levelCap: number = 15
    ): ScreepsReturnCode {
        let partsBlockCost = partsBlock.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);
        let partsArray = [];

        for (
            let i = 0;
            i < Math.floor((spawn.room.energyAvailable - (spawn.room.memory.reservedEnergy ?? 0)) / partsBlockCost) &&
            (i + 1) * partsBlock.length <= 50 &&
            i < levelCap;
            i++
        ) {
            partsArray = partsArray.concat(partsBlock);
        }

        if (!partsArray.length) {
            return ERR_NOT_ENOUGH_ENERGY;
        }

        return spawn.smartSpawn(partsArray, this.generateName(opts.memory.role, spawn.name), opts);
    }

    // spawn the largest creep possible as calculated with spawn.energyCapacityAvailable
    static spawnMax(
        spawn: StructureSpawn,
        partsBlock: BodyPartConstant[],
        name: string,
        opts?: SpawnOptions,
        levelCap: number = 15
    ): ScreepsReturnCode {
        let partsBlockCost = partsBlock.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);
        let partsArray = [];

        for (
            let i = 0;
            i < Math.floor(spawn.room.energyCapacityAvailable / partsBlockCost) && (i + 1) * partsBlock.length <= 50 && i < levelCap;
            i++
        ) {
            partsArray = partsArray.concat(partsBlock);
        }

        return spawn.smartSpawn(partsArray, this.generateName(opts.memory.role, spawn.name), opts);
    }

    static smartSpawn(spawn: StructureSpawn, name: string, body: BodyPartConstant[], opts?: SpawnOptions) {
        let partsArrayCost = body.length ? body.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost) : 0;

        if (partsArrayCost > spawn.room.energyAvailable - (spawn.room.memory.reservedEnergy ?? 0)) {
            return ERR_NOT_ENOUGH_ENERGY;
        }

        let labTasksToAdd = [];
        if (spawn.room.labs.length) {
            if (opts.boosts?.length) {
                //get total requested boosts available by type
                let boostMap = getResourceBoostsAvailable(spawn.room, Array.from(opts.boosts));

                //calculate number of boosts needed
                opts.boosts.forEach((boostType) => {
                    let boostsAvailable = boostMap[boostType];
                    let boostsAvailableCount = boostsAvailable?.map((boost) => boost.amount).reduce((sum, next) => sum + next) ?? 0;
                    let boostsRequested = body.filter((p) => p === BODY_TO_BOOST_MAP[boostType]).length;

                    let numberOfBoosts = Math.min(boostsRequested, boostsAvailableCount);

                    let resourcesNeeded: { [resource: string]: number } = {};

                    for (let i = 0; i < numberOfBoosts; i++) {
                        let nextAvailableBoostResource = boostMap[boostType].filter((boost) => boost.amount > 0)[0].resource;
                        boostMap[nextAvailableBoostResource] -= 1;
                        !resourcesNeeded[nextAvailableBoostResource]
                            ? (resourcesNeeded[nextAvailableBoostResource] = 30)
                            : (resourcesNeeded[nextAvailableBoostResource] += 30);
                    }

                    Object.keys(resourcesNeeded).forEach((resource) => {
                        labTasksToAdd.push({
                            type: LabTaskType.BOOST,
                            reagentsNeeded: [{ resource: resource as ResourceConstant, amount: resourcesNeeded[resource] }],
                            targetCreepName: name,
                        });
                    });
                });

                if (labTasksToAdd.length) {
                    opts.memory.needsBoosted = true;
                }
            }
        }

        // find safe spawn direction in predefined layouts
        if (spawn.room.memory?.layout === RoomLayout.BUNKER) {
            if (!opts.directions) {
                let anchorPoint = posFromMem(spawn.room.memory.anchorPoint);

                if (spawn.pos.x - anchorPoint.x === 0) {
                    opts.directions = [TOP_LEFT, TOP_RIGHT];
                } else if (spawn.pos.x - anchorPoint.x === -1) {
                    opts.directions = [TOP_LEFT, TOP, LEFT];
                } else if (spawn.pos.x - anchorPoint.x === 2) {
                    opts.directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM];
                }
            }
        }

        if (!opts.disableSort) {
            const getSortValue = (part: BodyPartConstant): number => {
                switch (part) {
                    case TOUGH:
                        return 5;
                    case RANGED_ATTACK:
                    case ATTACK:
                        return 4;
                    case WORK:
                        return 3;
                    case CARRY:
                        return 2;
                    case MOVE:
                        return 1;
                    case CLAIM:
                    case HEAL:
                        return 0;
                }
            };

            body = body.sort((a, b) => getSortValue(b) - getSortValue(a));
        }

        let result = spawn.spawnCreep(body, name, opts);

        if (result !== OK) {
            console.log(`Unexpected result from smartSpawn in spawn ${spawn.name}: ${result} - body: ${body} - opts: ${JSON.stringify(opts)}`);
        } else {
            spawn.room.memory.reservedEnergy != undefined
                ? (spawn.room.memory.reservedEnergy += partsArrayCost)
                : (spawn.room.memory.reservedEnergy = partsArrayCost);
            labTasksToAdd.forEach((task) => {
                spawn.room.addLabTask(task);
            });
        }

        return result;
    }

    static spawnManager(spawn: StructureSpawn): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.MANAGER,
                currentTaskPriority: Priority.HIGH,
            },
        };

        let immobile = false;

        if (spawn.room.memory?.layout === RoomLayout.BUNKER) {
            let anchorPoint = posFromMem(spawn.room.memory.anchorPoint);

            if (spawn.pos.x - anchorPoint.x === 0) {
                options.directions = [BOTTOM];
            } else if (spawn.pos.x - anchorPoint.x === -1) {
                options.directions = [BOTTOM_RIGHT];
            }

            immobile = true;
        }

        if (immobile) {
            return spawn.spawnMax([CARRY, CARRY], this.generateName(options.memory.role, spawn.name), options, 8);
        } else {
            let body = this.createPartsArray([CARRY, CARRY], spawn.room.energyCapacityAvailable, 8).concat([MOVE]);
            return spawn.smartSpawn(body, this.generateName(options.memory.role, spawn.name), options);
        }
    }

    static needsManager(room: Room): boolean {
        let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === room.name);
        let manager = roomCreeps.find((creep) => creep.memory.role === Role.MANAGER);
        return room.controller?.level >= 5 && (room.memory.layout !== undefined || !!room.memory.managerPos) && !manager;
    }

    static hasProtector(roomName: string): boolean {
        return (
            Object.values(Game.creeps).some(
                (creep) => creep.memory.role === Role.PROTECTOR && (creep.memory.assignment === roomName || creep.pos.roomName === roomName)
            ) ||
            Memory.spawnAssignments.some((creep) => creep.spawnOpts.memory.role === Role.PROTECTOR && creep.spawnOpts.memory.assignment === roomName)
        );
    }

    static currentNumRampartProtectors(roomName: string): number {
        return (
            Object.values(Game.creeps).filter((creep) => creep.memory.role === Role.RAMPART_PROTECTOR && creep.pos.roomName === roomName).length +
            Memory.spawnAssignments.filter(
                (creep) => creep.spawnOpts.memory.role === Role.RAMPART_PROTECTOR && creep.spawnOpts.memory.room === roomName
            ).length
        );
    }

    static needsTransporter(room: Room) {
        let transporter = Object.values(Game.creeps).find((c) => c.memory.role === Role.TRANSPORTER && c.memory.room === room.name);
        let bigDroppedResources = room.find(FIND_DROPPED_RESOURCES).filter((res) => res.resourceType === RESOURCE_ENERGY && res.amount > 1000);
        return !transporter && !!room.storage && bigDroppedResources.length > 1;
    }

    static needsMineralMiner(room: Room) {
        if (!room.memory.mineralMiningAssignments) {
            room.memory.mineralMiningAssignments = {};
        }

        if (room.storage?.store.getFreeCapacity() < 100000 || room.storage?.store[room.mineral.mineralType] > 100000) {
            return false;
        }

        let mineralMiningAssignments = room.memory.mineralMiningAssignments;
        return Object.keys(mineralMiningAssignments).some(
            (k) =>
                mineralMiningAssignments[k] === AssignmentStatus.UNASSIGNED &&
                (Game.rooms[posFromMem(k)?.roomName]
                    ? posFromMem(k)
                          .findInRange(FIND_STRUCTURES, 1)
                          .filter((struct) => struct.structureType === STRUCTURE_EXTRACTOR && struct.isActive()).length &&
                      Game.rooms[posFromMem(k)?.roomName].mineral.mineralAmount > 0
                    : true)
        );
    }

    static spawnMineralMiner(spawn: StructureSpawn): ScreepsReturnCode {
        let nextAvailableAssignment = Object.keys(spawn.room.memory.mineralMiningAssignments).find(
            (k) => spawn.room.memory.mineralMiningAssignments[k] === AssignmentStatus.UNASSIGNED
        );

        let options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.MINERAL_MINER,
                currentTaskPriority: Priority.HIGH,
                assignment: nextAvailableAssignment,
            },
        };

        let name = this.generateName(options.memory.role, spawn.name);
        let result = spawn.spawnMax([WORK, WORK, MOVE], name, options);
        if (result === OK) {
            spawn.room.memory.mineralMiningAssignments[nextAvailableAssignment] = name;
        }
        return result;
    }

    static findRemoteMineralMinerNeed(room: Room) {
        if (room.storage?.store.getFreeCapacity() < 100000 || room.storage?.store[room.mineral.mineralType] > 100000) {
            return false;
        }

        return room.memory.remoteMiningRooms.find(
            (remoteRoom) =>
                Memory.roomData[remoteRoom].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
                Memory.remoteData[remoteRoom].threatLevel !== RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
                Memory.remoteData[remoteRoom].reservationState !== RemoteRoomReservationStatus.ENEMY &&
                Memory.remoteData[remoteRoom].mineralAvailableAt <= Game.time &&
                Memory.remoteData[remoteRoom].mineralMiner === AssignmentStatus.UNASSIGNED
        );
    }

    static spawnRemoteMineralMiner(spawn: StructureSpawn, remoteRoomName: string): ScreepsReturnCode {
        const options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.REMOTE_MINERAL_MINER,
                currentTaskPriority: Priority.HIGH,
                assignment: remoteRoomName,
            },
        };

        const name = this.generateName(options.memory.role, spawn.name);
        const result = spawn.spawnMax([WORK, WORK, CARRY, MOVE, MOVE], name, options);
        if (result === OK) {
            Memory.remoteData[remoteRoomName].mineralMiner = name;
        }
        return result;
    }

    static findExterminatorNeed(room: Room): string {
        return Object.values(room.memory.remoteMiningRooms).find(
            (remoteRoom) =>
                Memory.roomData[remoteRoom].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
                Memory.remoteData[remoteRoom].threatLevel !== RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
                Memory.remoteData[remoteRoom].keeperExterminator === AssignmentStatus.UNASSIGNED
        );
    }

    static spawnKeeperExterminator(spawn: StructureSpawn, remoteRoomName: string): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                assignment: remoteRoomName,
                room: spawn.room.name,
                role: Role.KEEPER_EXTERMINATOR,
            },
            disableSort: true,
        };

        let body = [
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            HEAL,
            HEAL,
            HEAL,
            HEAL,
            HEAL,
            HEAL,
        ];

        let name = this.generateName(options.memory.role, spawn.name);
        let result = spawn.smartSpawn(body, name, options);

        if (result === OK) {
            Memory.remoteData[remoteRoomName].keeperExterminator = name;
        }

        return result;
    }

    static calculateRemoteMinerWorkNeeded(roomName: string) {
        let data = Memory.roomData[roomName];
        let energyPotential = isKeeperRoom(roomName) ? 4000 * 3 : 3000 * data.sourceCount;
        let workNeeded = energyPotential / (HARVEST_POWER * 300);

        return workNeeded > 5 ? workNeeded * 1.2 : workNeeded;
    }
}
