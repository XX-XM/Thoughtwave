import { getResourceAmount } from './resourceManagement';

export function runLabs(room: Room) {
    if (!room.memory.labTasks) {
        room.memory.labTasks = [];
    }

    if (!room.memory.labRequests) {
        room.memory.labRequests = [];
    }

    //manage queue
    room.memory.labTasks = room.memory.labTasks.filter((task) => task.status !== TaskStatus.COMPLETE);

    let nextQueuedTaskIndex = room.memory.labTasks.findIndex((task) => task.status === TaskStatus.QUEUED);
    if (nextQueuedTaskIndex > -1) {
        let updatedTask = attemptToStartTask(room, room.memory.labTasks[nextQueuedTaskIndex]);

        if (updatedTask) {
            room.memory.labTasks[nextQueuedTaskIndex] = updatedTask;
        }
    }

    let labs = room.labs;
    let labsInUse = labs.filter((lab) => lab.status !== LabStatus.AVAILABLE);
    let primaryLabsInUse = labs.filter((lab) => lab.status === LabStatus.IN_USE_PRIMARY);

    //if there are 4 or more available labs, try to add react task
    if (labs.length - labsInUse.length > 3) {
        let resourceToMake = getNextResourceToCreate(room);
        if (resourceToMake) {
            let reagents = getReagents(resourceToMake);
            let amountToCreate = Math.min(...reagents.map((resource) => getResourceAmount(room, resource)), 3000);
            let result = room.addLabTask({
                type: LabTaskType.REACT,
                reagentsNeeded: reagents.map((r) => {
                    return { resource: r, amount: amountToCreate };
                }),
            });
            if (result === OK) {
                console.log(`${room.name} added task to create ${amountToCreate} ${resourceToMake}`);
            }
        }
    }

    //run tasks
    primaryLabsInUse.forEach((lab) => {
        let task = lab.room.memory.labTasks[lab.taskIndex];
        if (task?.status === TaskStatus.ACTIVE) {
            switch (task.type) {
                case LabTaskType.REACT:
                    task = runReactTask(task);
                    break;
                case LabTaskType.REVERSE:
                    task = runReverseTask(task);
                    break;
                case LabTaskType.BOOST:
                    task = runBoostTask(task);
                    break;
                case LabTaskType.UNBOOST:
                    task = runUnboostTask(task);
                    break;
            }
        } else if (task?.status === TaskStatus.PREPARING) {
            let allNeedsFulfilled = task.reagentsNeeded
                .map((need) => Game.getObjectById(need.lab).store[need.resource] >= need.amount)
                .reduce((readyState, next) => readyState && next);

            if (allNeedsFulfilled) {
                task.status = TaskStatus.ACTIVE;
            }
        }

        room.memory.labTasks[lab.taskIndex] = task;
    });
}

function runReactTask(task: LabTask): LabTask {
    let primaryLabs = task.reactionLabs.map((id) => Game.getObjectById(id));
    let auxillaryLabs = task.auxillaryLabs.map((id) => Game.getObjectById(id));

    let targetCycles = task.reagentsNeeded[0].amount / 5;

    if (task.cyclesCompleted < targetCycles) {
        primaryLabs.forEach((lab) => {
            let result = lab.runReaction(auxillaryLabs[0], auxillaryLabs[1]);
            if (result === OK) {
                task.cyclesCompleted++;
            }
        });
    } else {
        task.status = TaskStatus.COMPLETE;
    }

    return task;
}

function runReverseTask(task: LabTask): LabTask {
    let primaryLabs = task.reactionLabs.map((id) => Game.getObjectById(id));
    let auxillaryLabs = task.auxillaryLabs.map((id) => Game.getObjectById(id));

    let targetCycles = task.reagentsNeeded[0].amount / 5;

    if (task.cyclesCompleted < targetCycles) {
        primaryLabs.forEach((lab) => {
            let result = lab.reverseReaction(auxillaryLabs[0], auxillaryLabs[1]);
            if (result === OK) {
                task.cyclesCompleted++;
            }
        });
    } else {
        task.status = TaskStatus.COMPLETE;
    }

    return task;
}

function runBoostTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.reactionLabs[0]);
    let targetCreep = Game.creeps[task.targetCreepName];

    if (targetCreep?.pos.isNearTo(primaryLab)) {
        let result = primaryLab.boostCreep(targetCreep);
        if (result === OK) {
            task.status = TaskStatus.COMPLETE;
        }
    }

    return task;
}

function runUnboostTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.reactionLabs[0]);
    let targetCreep = Game.creeps[task.targetCreepName];

    if (targetCreep?.pos.isNearTo(primaryLab)) {
        let result = primaryLab.unboostCreep(targetCreep);
        if (result === OK) {
            task.status = TaskStatus.COMPLETE;
        }
    }

    return task;
}

export function findLabs(room: Room, type: LabTaskType): Id<StructureLab>[][] {
    let availableLabs = room.labs.filter((lab) => lab.status === LabStatus.AVAILABLE);

    if (!availableLabs.length) {
        return undefined;
    }

    let primaryLabs: StructureLab[] = [];
    let auxLabs: StructureLab[] = [];

    if (type === LabTaskType.BOOST || type === LabTaskType.UNBOOST) {
        primaryLabs[0] = availableLabs.pop();
    } else {
        if (availableLabs.length < 3) {
            return undefined;
        } else {
            if (type === LabTaskType.REACT) {
                //can use multiple reaction labs to speed up task - find aux labs first
                //find available labs w/ most adjacent labs
                let labsWithAdjacentCount = availableLabs
                    .map((lab) => {
                        return {
                            lab: lab,
                            inRangeCount: lab.pos.findInRange(FIND_MY_STRUCTURES, 2, {
                                filter: (adjacentLab) => adjacentLab?.id !== lab?.id && availableLabs.includes(adjacentLab as StructureLab),
                            }).length,
                        };
                    })
                    .filter((lab) => lab.inRangeCount > 1)
                    .sort((a, b) => b.inRangeCount - a.inRangeCount)
                    .map((labWithCount) => labWithCount.lab);

                if (labsWithAdjacentCount.length < 3) {
                    return undefined;
                }

                auxLabs = labsWithAdjacentCount.splice(0, 2);
                for (let i = 0; i < labsWithAdjacentCount.length && auxLabs.length + primaryLabs.length < availableLabs.length - 1; i++) {
                    if (labsWithAdjacentCount[i].pos.inRangeTo(auxLabs[0], 2) && labsWithAdjacentCount[i].pos.inRangeTo(auxLabs[1], 2)) {
                        primaryLabs.push(labsWithAdjacentCount[i]);
                    }
                }

                if (!primaryLabs.length) {
                    return undefined;
                }
            } else {
                let suitablePrimaryLab = availableLabs.find((lab, index) => {
                    let adjacentAvailableLabs = availableLabs.filter((auxLab, auxIndex) => auxIndex !== index && lab.pos.getRangeTo(auxLab) <= 2);
                    return adjacentAvailableLabs.length >= 2;
                });

                if (suitablePrimaryLab) {
                    primaryLabs[0] = suitablePrimaryLab;
                    let availableAuxLabs = availableLabs.filter(
                        (auxLab) => auxLab.id !== primaryLabs[0].id && primaryLabs[0].pos.getRangeTo(auxLab) <= 2
                    );
                    while (auxLabs.length < 2) {
                        auxLabs.push(availableAuxLabs.shift());
                    }
                } else {
                    return undefined;
                }
            }
        }
    }

    return [primaryLabs.map((lab) => lab?.id), auxLabs.map((lab) => lab?.id)];
}

export function addLabTask(room: Room, opts: LabTaskOpts): ScreepsReturnCode {
    //check room for necessary resources
    let roomHasAllResources = opts.reagentsNeeded
        .map((need) => roomHasNeededResource(room, need))
        .reduce((hasNeeded, nextNeed) => hasNeeded && nextNeed);

    if (roomHasAllResources) {
        let task: LabTask = {
            status: TaskStatus.QUEUED,
            ...opts,
        };

        room.memory.labTasks.push(task);
        return OK;
    }

    return ERR_NOT_ENOUGH_RESOURCES;
}

function attemptToStartTask(room: Room, task: LabTask): LabTask {
    let labsFound: Id<StructureLab>[][] = findLabs(room, task.type);
    if (labsFound) {
        task.reactionLabs = labsFound[0];
        if (task.type === LabTaskType.REACT || task.type === LabTaskType.REVERSE) {
            task.auxillaryLabs = labsFound[1];
            if (task.type === LabTaskType.REACT) {
                task.reagentsNeeded.forEach((need, index) => {
                    need.lab = task.auxillaryLabs[index];
                });
            } else {
                task.reagentsNeeded[0].lab = task.reactionLabs[0];
            }

            task.cyclesCompleted = 0;
        } else {
            if (task.type === LabTaskType.BOOST) {
                task.reagentsNeeded[0].lab = task.reactionLabs[0];
            }
        }

        task.reagentsNeeded.forEach((need) => {
            room.memory.labRequests.push(need);
        });

        task.status = TaskStatus.PREPARING;
        return task;
    }

    return undefined;
}

function roomHasNeededResource(room: Room, need: LabNeed) {
    return room.storage?.store[need.resource] >= need.amount ? true : room.terminal?.store[need.resource] >= need.amount ? true : false;
}

export function getResourceBoostsAvailable(
    room: Room,
    boostNeeds: BoostType[]
): { [type: number]: { resource: ResourceConstant; amount: number }[] } {
    let availableResources: { [type: number]: { resource: ResourceConstant; amount: number }[] } = {};

    let getBoostAvailabilityForResource = (room: Room, resource: ResourceConstant) => {
        return Math.floor(((room.storage?.store[resource] ?? 0) + (room.terminal?.store[resource] ?? 0)) / 30);
    };

    if (boostNeeds.includes(BoostType.ATTACK)) {
        Object.keys(BOOSTS[ATTACK]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.ATTACK] = [
                    ...(availableResources[BoostType.ATTACK as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });

        availableResources[BoostType.ATTACK] = availableResources[BoostType.ATTACK]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.RANGED_ATTACK)) {
        Object.keys(BOOSTS[RANGED_ATTACK]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.RANGED_ATTACK] = [
                    ...(availableResources[BoostType.RANGED_ATTACK as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });
        availableResources[BoostType.RANGED_ATTACK] = availableResources[BoostType.RANGED_ATTACK]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.HEAL)) {
        Object.keys(BOOSTS[HEAL]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.HEAL] = [
                    ...(availableResources[BoostType.HEAL as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });
        availableResources[BoostType.HEAL] = availableResources[BoostType.HEAL]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.CARRY)) {
        Object.keys(BOOSTS[CARRY]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.CARRY] = [
                    ...(availableResources[BoostType.CARRY as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });
        availableResources[BoostType.CARRY] = availableResources[BoostType.CARRY]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.MOVE)) {
        Object.keys(BOOSTS[MOVE]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.MOVE] = [
                    ...(availableResources[BoostType.MOVE as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });
        availableResources[BoostType.MOVE] = availableResources[BoostType.MOVE]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.TOUGH)) {
        Object.keys(BOOSTS[TOUGH]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.TOUGH] = [
                    ...(availableResources[BoostType.TOUGH as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });
        availableResources[BoostType.TOUGH] = availableResources[BoostType.TOUGH]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.UPGRADE)) {
        [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ACID].forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.UPGRADE] = [...(availableResources[BoostType.UPGRADE as number] ?? []), { resource, amount }];
            }
        });
        availableResources[BoostType.UPGRADE] = availableResources[BoostType.UPGRADE]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.BUILD)) {
        [RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_LEMERGIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ACID].forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.BUILD] = [...(availableResources[BoostType.BUILD as number] ?? []), { resource, amount }];
            }
        });
        availableResources[BoostType.BUILD] = availableResources[BoostType.BUILD]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.DISMANTLE)) {
        [RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_ZYNTHIUM_ACID, RESOURCE_CATALYZED_ZYNTHIUM_ACID].forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.DISMANTLE] = [...(availableResources[BoostType.DISMANTLE as number] ?? []), { resource, amount }];
            }
        });
        availableResources[BoostType.DISMANTLE] = availableResources[BoostType.DISMANTLE]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.HARVEST)) {
        [RESOURCE_UTRIUM_OXIDE, RESOURCE_UTRIUM_ALKALIDE, RESOURCE_CATALYZED_UTRIUM_ALKALIDE].forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.HARVEST] = [...(availableResources[BoostType.HARVEST as number] ?? []), { resource, amount }];
            }
        });
        availableResources[BoostType.HARVEST] = availableResources[BoostType.HARVEST]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    return availableResources;
}

//find next needed resource that room can currently create
export function getNextResourceToCreate(room: Room): MineralCompoundConstant {
    return Object.keys(global.resourceNeeds).find(
        (resource) => global.resourceNeeds[resource].length && hasNecessaryReagentsForReaction(room, resource as MineralCompoundConstant)
    ) as MineralCompoundConstant;
}

export function hasNecessaryReagentsForReaction(room: Room, compound: MineralCompoundConstant): boolean {
    return getReagents(compound)
        .map((resource) => getResourceAmount(room, resource) > 0)
        .reduce((hasAll, next) => hasAll && next);
}

export function getReagents(compound: MineralCompoundConstant): ResourceConstant[] {
    let reagents = [];

    if (compound.length === 2) {
        reagents = compound.split('');
    } else if (compound.startsWith('X')) {
        reagents = ['X', compound.substring(1, compound.length)];
    } else if (compound.includes('H2')) {
        reagents = [compound.charAt(0) + 'H', 'OH'];
    } else if (compound.includes('O2')) {
        reagents = [compound.charAt(0) + 'O', 'OH'];
    } else {
        reagents = ['ZK', 'UL'];
    }

    return reagents;
}

//for testing
export function tryAddNextReact(room: Room) {
    let resourceToMake = getNextResourceToCreate(room);
    if (resourceToMake) {
        let reagents = getReagents(resourceToMake);
        let amountToCreate = Math.min(...reagents.map((resource) => getResourceAmount(room, resource)), 3000);
        room.addLabTask({
            type: LabTaskType.REACT,
            reagentsNeeded: reagents.map((r) => {
                return { resource: r, amount: amountToCreate };
            }),
        });
    }
}
