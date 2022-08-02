import { CombatCreep } from '../virtualCreeps/combatCreep';

export class KeeperExterminator extends CombatCreep {
    private attacked: boolean = false;
    protected run() {
        if (this.room.name === this.memory.assignment || this.memory.targetId) {
            let target = Game.getObjectById(this.memory.targetId);
            if (!target) {
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);
            }

            if (target instanceof ConstructionSite) {
                let miner = Game.creeps[Memory.remoteData[this.memory.assignment].miner];
                //scan area for keeper
                let keeper = target.pos.findInRange(FIND_HOSTILE_CREEPS, 5, { filter: (c) => c.owner.username === 'Source Keeper' }).shift();
                if (keeper && this.pos.isNearTo(keeper)) {
                    this.attackCreep(keeper);
                } else if (miner?.memory.destination !== target.pos.toMemSafe() || !miner?.pos.isNearTo(target.pos)) {
                    this.travelTo(target.pos, { avoidSourceKeepers: false });
                } else {
                    this.travelTo(
                        target.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR }),
                        { range: 1 }
                    );
                }
            } else if (target instanceof Structure) {
                if (!this.pos.isNearTo(target)) {
                    this.travelTo(target, { range: 1, avoidSourceKeepers: false });
                }

                //scan area for keeper
                let keeper = target.pos.findInRange(FIND_HOSTILE_CREEPS, 5, { filter: (c) => c.owner.username === 'Source Keeper' }).shift();
                if (keeper) {
                    this.memory.targetId = keeper.id;
                }
            } else if (target instanceof Creep) {
                if (this.pos.isNearTo(target)) {
                    this.attackCreep(target as Creep);
                    this.attacked = true;
                    this.move(this.pos.getDirectionTo(target)); // Stay in range if the enemy creep moves
                } else {
                    this.travelTo(target, { range: 1, avoidSourceKeepers: false });
                }
            }

            if (!this.attacked) {
                this.heal(this);
            }
        } else {
            this.travelToRoom(this.memory.assignment);
        }
    }

    private findTarget(): Id<Creep> | Id<Structure> | Id<ConstructionSite> {
        let containerConstructionSite = Game.rooms[this.memory.assignment]
            ?.find(FIND_MY_CONSTRUCTION_SITES, { filter: (site) => site.structureType === STRUCTURE_CONTAINER })
            .shift();
        if (containerConstructionSite) {
            return containerConstructionSite.id;
        }

        let invaders = Game.rooms[this.memory.assignment]?.find(FIND_HOSTILE_CREEPS, {
            filter: (c) =>
                c.getActiveBodyparts(ATTACK) > 0 ||
                ((c.getActiveBodyparts(RANGED_ATTACK) || c.getActiveBodyparts(HEAL) > 0) && c.owner.username !== 'Source Keeper'),
        });
        if (invaders?.length) {
            return this.pos.findClosestByPath(invaders).id;
        }

        let keepers = Game.rooms[this.memory.assignment]?.find(FIND_HOSTILE_CREEPS, { filter: (c) => c.owner.username === 'Source Keeper' });
        if (keepers?.length) {
            return this.pos.findClosestByPath(keepers)?.id;
        }

        let lairs = Game.rooms[this.memory.assignment]?.find(FIND_HOSTILE_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR,
        }) as StructureKeeperLair[];
        let nextSpawn = lairs?.reduce((lowestTimer, next) => (lowestTimer.ticksToSpawn <= next.ticksToSpawn ? lowestTimer : next));
        if (nextSpawn) {
            return nextSpawn.id;
        }
    }
}
