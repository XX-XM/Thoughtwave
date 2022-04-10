import { addColonizationOperation } from './empireManagement';
import { unclaimRoom } from './memoryManagement';

export default function manageFlags() {
    if (Game.flags.colonize) {
        addColonizationOperation();
        Game.flags.colonize.remove();
    }

    if (Game.flags.unclaim) {
        unclaimRoom(Game.flags.unclaim.room.name);
        Game.flags.unclaim.remove();
    }
}
