export function addRoomData(room: Room) {
    let data: RoomData = {
        sourceCount: room.find(FIND_SOURCES).length,
        mineralType: room.mineral?.mineralType,
        asOf: Game.time,
    };

    if (room.controller?.owner?.username) {
        data.owner = room.controller.owner.username;

        if (data.owner === 'Invader') {
            data.roomStatus = RoomMemoryStatus.OWNED_INVADER;
        } else if (room.controller.my) {
            data.roomStatus = RoomMemoryStatus.OWNED_ME;
        } else {
            data.roomStatus = RoomMemoryStatus.OWNED_OTHER;
        }
    } else if (room.controller?.reservation) {
        if (room.controller.reservation.username === getUsername()) {
            data.roomStatus = RoomMemoryStatus.RESERVED_ME;
        } else if (room.controller.reservation.username === 'Invader') {
            data.roomStatus = RoomMemoryStatus.RESERVED_INVADER;
        } else {
            data.roomStatus = RoomMemoryStatus.RESERVED_OTHER;
        }
    }

    if (data.owner && data.roomStatus !== RoomMemoryStatus.OWNED_ME) {
        if (room.find(FIND_HOSTILE_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER && s.isActive() }).length) {
            data.hostile = true;
        }
    }

    Memory.roomData[room.name] = data;
}

export function updateRoomData(room: Room) {
    let data = Memory.roomData[room.name];

    if (room.controller?.owner?.username) {
        data.owner = room.controller.owner.username;

        if (data.owner === 'Invader') {
            data.roomStatus = RoomMemoryStatus.OWNED_INVADER;
        } else if (room.controller.my) {
            data.roomStatus = RoomMemoryStatus.OWNED_ME;
        } else {
            data.roomStatus = RoomMemoryStatus.OWNED_OTHER;
        }
    } else if (room.controller?.reservation) {
        delete data.owner;
        if (room.controller.reservation.username === getUsername()) {
            data.roomStatus = RoomMemoryStatus.RESERVED_ME;
        } else if (room.controller.reservation.username === 'Invader') {
            data.roomStatus = RoomMemoryStatus.RESERVED_INVADER;
        } else {
            data.roomStatus = RoomMemoryStatus.RESERVED_OTHER;
        }
    } else if (room.controller) {
        delete data.owner;
        data.roomStatus = RoomMemoryStatus.VACANT;
    }

    if (data.owner && data.roomStatus !== RoomMemoryStatus.OWNED_ME) {
        if (room.find(FIND_HOSTILE_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_TOWER && s.isActive() }).length) {
            data.hostile = true;
        }
    } else {
        delete data.hostile;
    }

    Memory.roomData[room.name] = data;
}

export function getUsername(): string {
    return (
        Object.values(Game.spawns)?.shift()?.owner.username ||
        Object.values(Game.creeps)?.shift()?.owner.username ||
        Object.values(Game.rooms).find((room) => room.controller?.my).controller.owner.username
    );
}
