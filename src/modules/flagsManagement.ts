import { addHostileRoom, unclaimRoom } from './empireManagement';
import { addOperation, findOperationOrigin } from './operationsManagement';
import { PopulationManagement } from './populationManagement';

export default function manageFlags() {
    if (Game.flags.colonize) {
        let portalLocations = [];

        if (Game.flags.portal) {
            portalLocations.push(Game.flags.portal.pos.toMemSafe());
            Game.flags.portal.remove();
        }

        addOperation(OperationType.COLONIZE, Game.flags.colonize.pos.roomName, { portalLocations: portalLocations });
        Game.flags.colonize.remove();
    }

    if (Game.flags.unclaim) {
        unclaimRoom(Game.flags.unclaim.pos.roomName);
        Game.flags.unclaim.remove();
    }

    if (Game.flags.hostile) {
        addHostileRoom(Game.flags.hostile.pos.roomName);
        Game.flags.hostile.remove();
    }

    if (Game.flags.intershardLaunch) {
        const origin = findOperationOrigin(Game.flags.intershardLaunch.pos.roomName)?.roomName;

        console.log(`Launching intershard colony from ${origin}`);

        Memory.empire.spawnAssignments.push({
            designee: origin,
            body: [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM],
            memoryOptions: {
                role: Role.CLAIMER,
            },
        });

        Memory.empire.spawnAssignments.push({
            designee: origin,
            body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[origin].energyCapacityAvailable),
            memoryOptions: {
                role: Role.COLONIZER,
            },
        });

        Memory.empire.spawnAssignments.push({
            designee: origin,
            body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[origin].energyCapacityAvailable),
            memoryOptions: {
                role: Role.COLONIZER,
            },
        });

        Memory.empire.spawnAssignments.push({
            designee: origin,
            body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[origin].energyCapacityAvailable),
            memoryOptions: {
                role: Role.COLONIZER,
            },
        });

        Game.flags.intershardLaunch.remove();
    }

    if (Game.flags.setManagerPos) {
        let managerPos = Game.flags.setManagerPos.pos;
        Memory.rooms[Game.flags.setManagerPos.room.name].managerPos = managerPos.toMemSafe();
        Game.flags.setManagerPos.remove();
    }

    if (Game.flags.sterilize) {
        addOperation(OperationType.STERILIZE, Game.flags.sterilize.pos.roomName);
        Game.flags.sterilize.remove();
    }

    if (Game.flags.collect) {
        addOperation(OperationType.COLLECTION, Game.flags.collect.pos.roomName, {
            originOpts: { minEnergyStatus: EnergyStatus.CRITICAL },
            operativeCount: 2,
        });
        Game.flags.collect.remove();
    }

    if (Game.flags.secure) {
        addOperation(OperationType.SECURE, Game.flags.secure.pos.roomName, {
            operativeCount: 2,
            expireAt: Game.time + 4500,
        });
        Game.flags.secure.remove();
    }

    if (Game.flags.recover) {
        addOperation(OperationType.ROOM_RECOVERY, Game.flags.recover.pos.roomName);
        Game.flags.recover.remove();
    }

    if (Game.flags.attack) {
        const flagName = 'squadMove';
        let forcedDestinations = [];
        let step = 1;
        while (Game.flags[flagName + step]) {
            forcedDestinations.push(Game.flags[flagName + step].pos.toMemSafe());
            Game.flags[flagName + step].remove();
            step++;
        }
        addOperation(OperationType.ATTACK, Game.flags.attack.pos.roomName, { forcedDestinations: forcedDestinations });
        Game.flags.attack.remove();
    }

    if (Game.flags.quadAttack) {
        const flagName = 'squadMove';
        let forcedDestinations = [];
        let step = 1;
        while (Game.flags[flagName + step]) {
            forcedDestinations.push(Game.flags[flagName + step].pos.toMemSafe());
            Game.flags[flagName + step].remove();
            step++;
        }
        addOperation(OperationType.QUAD_ATTACK, Game.flags.quadAttack.pos.roomName, { forcedDestinations: forcedDestinations });
        Game.flags.quadAttack.remove();
    }
}
