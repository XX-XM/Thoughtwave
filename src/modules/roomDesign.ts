export function findIndustryCenterLocation(room: Room) {
    //this find a good position for storage

    let pois = room.find(FIND_SOURCES).map((source) => source.pos);
    pois.push(room.controller.pos);

    let pointOfInterestSum = { x: 0, y: 0 };
    pois.forEach((pos) => {
        pointOfInterestSum.x += pos.x;
        pointOfInterestSum.y += pos.y;
    });

    let pointOfInterestAverage = new RoomPosition(pointOfInterestSum.x / pois.length, pointOfInterestSum.y / pois.length, room.name);

    let industryCenter = findClosestSuitablePosition(pointOfInterestAverage);

    room.visual.text('🌟', industryCenter[0].x, industryCenter[0].y);
    switch (industryCenter[1]) {
        case 0:
            //@ts-ignore
            room.visual.poly([
                industryCenter[0],
                [industryCenter[0].x + 1, industryCenter[0].y + 1],
                [industryCenter[0].x + 1, industryCenter[0].y + 2],
                [industryCenter[0].x, industryCenter[0].y + 2],
                [industryCenter[0].x - 1, industryCenter[0].y + 2],
                [industryCenter[0].x - 1, industryCenter[0].y + 1],
                industryCenter[0],
            ]);
            break;
        case 1:
            //@ts-ignore
            room.visual.poly([
                industryCenter[0],
                [industryCenter[0].x - 1, industryCenter[0].y + 1],
                [industryCenter[0].x - 2, industryCenter[0].y + 1],
                [industryCenter[0].x - 2, industryCenter[0].y],
                [industryCenter[0].x - 2, industryCenter[0].y - 1],
                [industryCenter[0].x - 1, industryCenter[0].y - 1],
                industryCenter[0],
            ]);
            break;
        case 2:
            //@ts-ignore
            room.visual.poly([
                industryCenter[0],
                [industryCenter[0].x - 1, industryCenter[0].y - 1],
                [industryCenter[0].x - 1, industryCenter[0].y - 2],
                [industryCenter[0].x, industryCenter[0].y - 2],
                [industryCenter[0].x + 1, industryCenter[0].y - 2],
                [industryCenter[0].x + 1, industryCenter[0].y - 1],
                industryCenter[0],
            ]);
            break;
        case 3:
            //@ts-ignore
            room.visual.poly([
                industryCenter[0],
                [industryCenter[0].x + 1, industryCenter[0].y + 1],
                [industryCenter[0].x + 2, industryCenter[0].y + 1],
                [industryCenter[0].x + 2, industryCenter[0].y],
                [industryCenter[0].x + 2, industryCenter[0].y - 1],
                [industryCenter[0].x + 1, industryCenter[0].y - 1],
                industryCenter[0],
            ]);
            break;
    }

    while (pois.length) {
        let path = industryCenter[0].findPathTo(pois.pop(), { swampCost: 1, ignoreDestructibleStructures: true, ignoreCreeps: true, range: 1 });

        //@ts-ignore
        room.visual.poly(path, { stroke: '#fff', strokeWidth: 0.15, opacity: 0.8, lineStyle: 'dotted' });
    }

    return industryCenter[1];
}

export function calculateRoomSpace(room: Room) {
    let totalWorkableSpace = 46 * 46;
    let walls = 0;

    for (let x = 2; x < 48; x++) {
        for (let y = 2; y < 48; y++) {
            let look = room.lookForAt(LOOK_TERRAIN, x, y);
            if (look.shift() === 'wall') {
                walls++;
            }
        }
    }

    console.log(`Wall ratio: ${walls / totalWorkableSpace}`);
}

function findClosestSuitablePosition(startPos: RoomPosition): [RoomPosition, Direction] {
    let endPos: RoomPosition;
    let dir: Direction;
    let stop = false;

    let baseCheck = canPlaceIndustryCenter(startPos);
    if (baseCheck !== undefined) {
        return [startPos, baseCheck];
    }

    for (let lookDistance = 1; lookDistance < 10 && !stop; lookDistance++) {
        let lookPos: RoomPosition;
        let x: number, y: number;

        for (y = startPos.y - lookDistance; y <= startPos.y + lookDistance && !stop; y++) {
            for (x = startPos.x - lookDistance; x <= startPos.x + lookDistance && !stop; x++) {
                if (y > startPos.y - lookDistance && y < startPos.y + lookDistance && x > startPos.x - lookDistance) {
                    x = startPos.x + lookDistance;
                }
                lookPos = new RoomPosition(x, y, startPos.roomName);

                let check = canPlaceIndustryCenter(lookPos);
                if (check !== undefined) {
                    endPos = lookPos;
                    dir = check;
                    stop = true;
                }
            }
        }
    }

    return [endPos, dir];
}

function canPlaceIndustryCenter(pos: RoomPosition): Direction {
    let room = Game.rooms[pos.roomName];

    //NORTH
    if (room.lookForAtArea(LOOK_TERRAIN, pos.y - 1, pos.x - 1, pos.y + 2, pos.x + 1, true).every((look) => look.terrain !== 'wall')) {
        return Direction.NORTH;
    }
    //EAST
    if (room.lookForAtArea(LOOK_TERRAIN, pos.y - 1, pos.x - 2, pos.y + 1, pos.x + 1, true).every((look) => look.terrain !== 'wall')) {
        return Direction.EAST;
    }
    //SOUTH
    if (room.lookForAtArea(LOOK_TERRAIN, pos.y - 2, pos.x - 1, pos.y + 1, pos.x + 1, true).every((look) => look.terrain !== 'wall')) {
        return Direction.SOUTH;
    }
    //WEST
    if (room.lookForAtArea(LOOK_TERRAIN, pos.y - 1, pos.x - 1, pos.y + 1, pos.x + 2, true).every((look) => look.terrain !== 'wall')) {
        return Direction.WEST;
    }

    return undefined;
}

export function findSquareLocation(room: Room): RoomPosition {
    let poiAvg = findPoiAverage(room);
    let starCenter = new RoomPosition(poiAvg.x - 1, poiAvg.y + 1, room.name);

    let valid = checkStarBoundary(starCenter);

    if (!valid) {
        for (let lookDistance = 1; lookDistance < 50; lookDistance++) {
            let lookPos: RoomPosition;
            let x: number, y: number;

            for (y = starCenter.y - lookDistance; y <= starCenter.y + lookDistance && !valid; y++) {
                for (x = starCenter.x - lookDistance; x <= starCenter.x + lookDistance && !valid; x++) {
                    if (y > starCenter.y - lookDistance && y < starCenter.y + lookDistance && x > starCenter.x - lookDistance) {
                        x = starCenter.x + lookDistance;
                    }

                    if (x > 1 && x < 49 && y > 1 && y < 49) {
                        lookPos = new RoomPosition(x, y, starCenter.roomName);

                        valid = checkStarBoundary(lookPos);
                    }
                    if (valid) {
                        starCenter = lookPos;
                        drawStar(starCenter);
                    }
                }
            }
        }
    }

    return valid ? starCenter : undefined;
}

function checkStarBoundary(starCenter: RoomPosition) {
    let room = Game.rooms[starCenter.roomName];

    let areaLooks = room.lookForAtArea(LOOK_TERRAIN, starCenter.y - 6, starCenter.x - 6, starCenter.y + 6, starCenter.x + 6, true);

    //if there are any walls in the area
    return !areaLooks.some((look) => look.terrain === 'wall');
}

export function drawStar(starCenter: RoomPosition) {
    let roomVis = Game.rooms[starCenter.roomName].visual;

    //draw roads
    roomVis.poly([
        [starCenter.x, starCenter.y - 3],
        [starCenter.x + 3, starCenter.y],
        [starCenter.x, starCenter.y + 3],
        [starCenter.x - 3, starCenter.y],
        [starCenter.x, starCenter.y - 3],
    ]);
    roomVis.line(starCenter.x, starCenter.y - 3, starCenter.x, starCenter.y - 6);
    roomVis.line(starCenter.x + 3, starCenter.y, starCenter.x + 6, starCenter.y);
    roomVis.line(starCenter.x, starCenter.y + 3, starCenter.x, starCenter.y + 6);
    roomVis.line(starCenter.x - 3, starCenter.y, starCenter.x - 6, starCenter.y);
    roomVis.line(starCenter.x - 2 + 0.5, starCenter.y - 2 + 0.5, starCenter.x - 4, starCenter.y - 4);
    roomVis.line(starCenter.x + 2 - 0.5, starCenter.y - 2 + 0.5, starCenter.x + 4, starCenter.y - 4);
    roomVis.line(starCenter.x + 2 - 0.5, starCenter.y + 2 - 0.5, starCenter.x + 4, starCenter.y + 4);
    roomVis.line(starCenter.x - 2 + 0.5, starCenter.y + 2 - 0.5, starCenter.x - 4, starCenter.y + 4);

    //draw border
    roomVis.rect(starCenter.x - 6 - 0.5, starCenter.y - 6 - 0.5, 13, 13, { fill: '#00E2FF', opacity: 0.1 });
}

export function getStructureForPos(layout: RoomLayout, targetPos: RoomPosition, referencePos: RoomPosition): BuildableStructureConstant {
    switch (layout) {
        case RoomLayout.SQUARE:
            let xdif = targetPos.x - referencePos.x;
            let ydif = targetPos.y - referencePos.y;

            if (targetPos === referencePos || Math.abs(xdif) >= 7 || Math.abs(ydif) >= 7 || (Math.abs(xdif) === 6 && Math.abs(ydif) === 6)) {
                return undefined;
            }

            if (xdif === 0) {
                switch (ydif) {
                    case 1:
                        return STRUCTURE_TERMINAL;
                    case -1:
                        return STRUCTURE_SPAWN;
                    case -2:
                    case 2:
                    case -6:
                    case 6:
                        return STRUCTURE_EXTENSION;
                    default:
                        return STRUCTURE_ROAD;
                }
            }

            if (ydif === 0) {
                switch (xdif) {
                    case -2:
                        return STRUCTURE_OBSERVER;
                    case -1:
                        return STRUCTURE_LINK;
                    case 1:
                        return STRUCTURE_FACTORY;
                    case 2:
                        return STRUCTURE_SPAWN;
                    default:
                        return STRUCTURE_ROAD;
                }
            }

            if (Math.abs(xdif) === 6 || Math.abs(ydif) === 6) {
                return STRUCTURE_ROAD;
            }

            if (ydif === -1 && xdif === -1) {
                return STRUCTURE_SPAWN;
            }
            if (ydif === -1 && xdif === 1) {
                return STRUCTURE_STORAGE;
            }
            if (ydif === 1 && xdif === 1) {
                return STRUCTURE_POWER_SPAWN;
            }
            if (ydif === 1 && xdif === -1) {
                return STRUCTURE_NUKER;
            }

            if (Math.abs(ydif) === Math.abs(xdif) && Math.abs(ydif) <= 5) {
                return STRUCTURE_ROAD;
            }
            if ((ydif === -3 && xdif >= -1 && xdif <= 2) || (xdif === 3 && ydif >= -2 && ydif <= 1)) {
                return STRUCTURE_TOWER;
            }
            if (ydif <= -2 && ydif >= -5 && xdif <= -3 && xdif >= -4) {
                return STRUCTURE_LAB;
            }
            if (ydif <= -3 && ydif >= -4 && (xdif === -2 || xdif === -5)) {
                return STRUCTURE_LAB;
            }

            if ((Math.abs(ydif) === 2 && Math.abs(xdif) === 1) || (Math.abs(xdif) === 2 && Math.abs(ydif) === 1)) {
                return STRUCTURE_ROAD;
            }

            return STRUCTURE_EXTENSION;
    }
}

export function findPoiAverage(room: Room) {
    let pois = room.find(FIND_SOURCES).map((source) => source.pos);
    pois.push(room.controller.pos);

    let pointOfInterestSum = { x: 0, y: 0 };
    pois.forEach((pos) => {
        pointOfInterestSum.x += pos.x;
        pointOfInterestSum.y += pos.y;
    });

    let pointOfInterestAverage = new RoomPosition(pointOfInterestSum.x / pois.length, pointOfInterestSum.y / pois.length, room.name);
    room.visual.text('🌟', pointOfInterestAverage);
    return pointOfInterestAverage;
}

const enum Direction {
    NORTH,
    EAST,
    SOUTH,
    WEST,
}
