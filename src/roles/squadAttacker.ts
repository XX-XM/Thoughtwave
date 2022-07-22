import { Pathing } from '../modules/pathing';
import { SquadManagement } from '../modules/squadManagement';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadAttacker extends CombatCreep {
    protected run() {
        const sq = new SquadManagement(this);
        sq.pathing();
        // Healing (+ RANGED_ATTACK if possible)
        let healingTarget: Creep;
        if (this.getActiveBodyparts(HEAL)) {
            const healingTarget = sq.getSquadHealingTarget();
            if (healingTarget) {
                if (this.pos.isNearTo(healingTarget)) {
                    this.heal(healingTarget);
                    if (this.getActiveBodyparts(RANGED_ATTACK)) {
                        // close range heal and rangedAttack can both happen in the same tick
                        this.attackTarget(3, sq);
                    }
                } else {
                    this.rangedHeal(healingTarget);
                }
            }
        }

        // Attacking (WORK/ATTACK/RANGED_ATTACK)
        if (!healingTarget) {
            if (this.getActiveBodyparts(WORK)) {
                this.dismantleTarget(sq);
            } else if (this.getActiveBodyparts(ATTACK)) {
                this.attackTarget(1, sq);
            } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
                this.attackTarget(3, sq);
            }
        }
    }

    private attackTarget(range: number, sq: SquadManagement) {
        const target = this.findPriorityAttackTarget(range, sq);

        if (target) {
            if (target instanceof Creep) {
                this.attackCreep(target);
            } else if (target instanceof Structure) {
                this.attackStructure(target);
            }
        }
    }

    private findPriorityAttackTarget(range: number, sq: SquadManagement) {
        const areaInRange = Pathing.getArea(this.pos, range);
        const unprotectedHostileCreep = this.room
            .lookAtArea(areaInRange.top, areaInRange.left, areaInRange.bottom, areaInRange.right, true)
            .filter(
                (lookObject) =>
                    lookObject.type === LOOK_CREEPS &&
                    lookObject.creep?.owner?.username !== this.owner.username &&
                    !lookObject.creep?.spawning &&
                    lookObject.structure?.structureType !== STRUCTURE_RAMPART &&
                    lookObject.structure?.structureType !== STRUCTURE_KEEPER_LAIR
            );
        if (unprotectedHostileCreep.length) {
            return unprotectedHostileCreep[0].creep;
        }

        if (this.pos.roomName === sq.assignment && !sq.isFleeing) {
            if (Game.flags.target?.pos?.roomName === sq.assignment) {
                // Manual targeting
                const enemyStructure = Game.flags.target.pos.lookFor(LOOK_STRUCTURES);
                if (enemyStructure.length) {
                    return enemyStructure[0];
                }
            }

            let target: any;
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_TOWER,
                });
            }
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_SPAWN,
                });
            }

            const obstacleStructure = sq.getObstacleStructure();
            if (obstacleStructure && (!target || this.pos.getRangeTo(target) > range)) {
                return obstacleStructure;
            }

            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
            }
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_KEEPER_LAIR,
                });
            }
            return target;
        }
    }

    private dismantleTarget(sq: SquadManagement) {
        const target = this.findPriorityDismantleTarget(sq);

        if (target) {
            this.dismantle(target);
        }
    }

    private findPriorityDismantleTarget(sq: SquadManagement) {
        if (this.pos.roomName === sq.assignment) {
            if (Game.flags.target?.pos?.roomName === sq.assignment) {
                // Manual targeting
                const enemyStructure = Game.flags.target.pos.lookFor(LOOK_STRUCTURES);
                if (enemyStructure.length) {
                    return enemyStructure[0];
                }
            }

            let target: any;
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_TOWER,
                });
            }
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_SPAWN,
                });
            }
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_KEEPER_LAIR,
                });
            }

            const obstacleStructure = sq.getObstacleStructure();
            if (obstacleStructure && (!target || this.pos.getRangeTo(target) > 1)) {
                return obstacleStructure;
            }
            return target;
        }
    }
}
