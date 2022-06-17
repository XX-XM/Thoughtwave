import { PopulationManagement } from './populationManagement';

export function driveRemoteRoom(room: Room) {
    if (room.memory.remoteAssignments) {
        try {
            Object.keys(room.memory.remoteAssignments).forEach((remoteRoomName) => {
                runSecurity(room, remoteRoomName);
            });
        } catch (e) {
            console.log(`Error caught in remote room management: \n${e}`);
        }
    }
}

function runSecurity(homeRoom: Room, remoteRoomName: string) {
    const targetRoom = Game.rooms[remoteRoomName];

    // --- ATTACK CREEPS
    const hostileAttackCreeps = targetRoom?.find(FIND_HOSTILE_CREEPS, {
        filter: (creep) => creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0,
    });

    // Excludes attack creeps and creeps with only move (scouts)
    const hostileOtherCreeps = targetRoom?.find(FIND_HOSTILE_CREEPS, {
        filter: (creep) =>
            creep.getActiveBodyparts(ATTACK) === 0 &&
            creep.getActiveBodyparts(RANGED_ATTACK) === 0 &&
            (creep.getActiveBodyparts(WORK) || creep.getActiveBodyparts(CARRY) || creep.getActiveBodyparts(HEAL) || creep.getActiveBodyparts(TOUGH)),
    });

    if (
        hostileAttackCreeps?.length ||
        (!targetRoom && homeRoom.memory.remoteAssignments[remoteRoomName].state === RemoteMiningRoomState.ENEMY_ATTTACK_CREEPS)
    ) {
        homeRoom.memory.remoteAssignments[remoteRoomName].state = RemoteMiningRoomState.ENEMY_ATTTACK_CREEPS;

        if (PopulationManagement.needsProtector(remoteRoomName) && !reassignIdleProtector(homeRoom.name, remoteRoomName)) {
            const maxBodySize = getMaxProtectorBodySize(
                hostileAttackCreeps,
                hostileOtherCreeps?.filter((creep) => creep.getActiveBodyparts(HEAL) > 0)
            );
            const body = PopulationManagement.createPartsArray([RANGED_ATTACK, MOVE], homeRoom.energyCapacityAvailable - 300, maxBodySize);
            body.push(HEAL, MOVE);
            spawnProtector(homeRoom.name, remoteRoomName, body);
        }
        return;
    }

    // --- OTHER CREEPS
    if (
        hostileOtherCreeps?.length ||
        (!targetRoom && homeRoom.memory.remoteAssignments[remoteRoomName].state === RemoteMiningRoomState.ENEMY_NON_COMBAT_CREEPS)
    ) {
        homeRoom.memory.remoteAssignments[remoteRoomName].state = RemoteMiningRoomState.ENEMY_NON_COMBAT_CREEPS;

        if (PopulationManagement.needsProtector(remoteRoomName) && !reassignIdleProtector(homeRoom.name, remoteRoomName)) {
            const maxSize = 6;
            const body = PopulationManagement.createPartsArray([RANGED_ATTACK, MOVE], homeRoom.energyCapacityAvailable - 300, maxSize);
            body.push(HEAL, MOVE);
            spawnProtector(homeRoom.name, remoteRoomName, body);
        }
        return;
    }

    // --- STRUCTURES
    const hostileStuctures = targetRoom
        ?.find(FIND_HOSTILE_STRUCTURES)
        .filter((struct) => !(struct.structureType === STRUCTURE_STORAGE && struct.store.getUsedCapacity()));
    if (
        hostileStuctures?.length ||
        (!targetRoom &&
            homeRoom.memory.remoteAssignments[remoteRoomName].state === RemoteMiningRoomState.ENEMY_STRUCTS &&
            !reassignIdleProtector(homeRoom.name, remoteRoomName))
    ) {
        homeRoom.memory.remoteAssignments[remoteRoomName].state = RemoteMiningRoomState.ENEMY_STRUCTS;

        if (PopulationManagement.needsProtector(remoteRoomName)) {
            spawnProtector(homeRoom.name, remoteRoomName, PopulationManagement.createPartsArray([ATTACK, MOVE], homeRoom.energyCapacityAvailable, 6));
        }
        return;
    }

    homeRoom.memory.remoteAssignments[remoteRoomName].state = RemoteMiningRoomState.SAFE;
}

function spawnProtector(homeRoomName: string, remoteRoomName: string, body: BodyPartConstant[]) {
    Memory.empire.spawnAssignments.push({
        designee: homeRoomName,
        body: body,
        memoryOptions: {
            role: Role.PROTECTOR,
            room: homeRoomName,
            assignment: remoteRoomName,
            currentTaskPriority: Priority.MEDIUM,
            combat: { flee: false },
        },
    });
}

/**
 * Calculate protector body depending on enemy numbers and body composition.
 * @param hostileCreeps -
 * @returns
 */
function getMaxProtectorBodySize(hostileCreeps: Creep[], healerCreeps: Creep[]) {
    const maxBodySize = 24; // Default max Body size (not 25 since all protectors have heal/move default parts)
    if (hostileCreeps?.length === 1 && !healerCreeps?.length) {
        let additionalBodySize = 2; // Adding extra body parts to gain advantage over the enemy
        if (hostileCreeps[0].body.some((creepBody) => creepBody.boost)) {
            additionalBodySize = 4;
        }
        const calculatedMaxBodySize = hostileCreeps[0].getActiveBodyparts(RANGED_ATTACK) + additionalBodySize;
        return calculatedMaxBodySize > maxBodySize ? maxBodySize : calculatedMaxBodySize;
    }
    return maxBodySize;
}

/**
 * Reassign idle protectors to needed room. If there are none check if a room has more than one protector and reassign one of them.
 *
 * @param homeRoomName -
 * @param targetRoomName -
 * @returns Boolean to check if a reassignment was possible
 */
function reassignIdleProtector(homeRoomName: string, targetRoomName: string): boolean {
    const protectors = Object.values(Game.creeps).filter(
        (creep) => creep.memory.room === homeRoomName && creep.memory.role === Role.PROTECTOR && creep.ticksToLive > 200
    );

    if (homeRoomName === targetRoomName) {
        // Home Protection (reassign and still spawn default ones)
        protectors.forEach((protector) => (protector.memory.assignment = targetRoomName));
        return false;
    }

    const idleProtector = protectors.find(
        (creep) => Memory.rooms[homeRoomName].remoteAssignments?.[creep.memory.assignment]?.state !== RemoteMiningRoomState.SAFE
    );
    if (idleProtector) {
        idleProtector.memory.assignment = targetRoomName;
        return true;
    }

    const duplicateProtector = protectors.find((protector, i) => protectors.indexOf(protector) !== i);
    if (duplicateProtector) {
        duplicateProtector.memory.assignment = targetRoomName;
        return true;
    }
    return false;
}
