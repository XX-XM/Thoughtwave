export function manageEmpireResources() {
    let terminalRooms = Object.values(Game.rooms).filter((room) => room.controller?.my && room.terminal?.isActive());
    let roomsInNeed = terminalRooms.filter((room) => room.energyStatus < EnergyStatus.STABLE).sort((a, b) => a.energyStatus - b.energyStatus);
    let roomsInProgress = terminalRooms.filter((room) => room.controller.level < 8 && room.energyStatus < EnergyStatus.SURPLUS);

    terminalRooms
        .filter((room) => !room.terminal.cooldown)
        .forEach((room) => {
            if (!room.memory.shipments?.length) {
                if (hasExtraEnergy(room) && room.terminal.store.energy >= 50000) {
                    if (roomsInNeed.length) {
                        let recipientName = findClosestRecipient(room, roomsInNeed);
                        let amountToSend = calculateEnergyToSend(room.name, recipientName);
                        let result = room.terminal.send(RESOURCE_ENERGY, amountToSend, recipientName);
                        if (result === OK) {
                            console.log(
                                `${room.name} sent ${amountToSend} energy to ${recipientName}: Cost: ${Game.market.calcTransactionCost(
                                    amountToSend,
                                    room.name,
                                    recipientName
                                )}`
                            );
                            return;
                        } else {
                            console.log(
                                `${room.name} was unable to send energy to ${recipientName}: ${result} Cost: ${Game.market.calcTransactionCost(
                                    amountToSend,
                                    room.name,
                                    recipientName
                                )}`
                            );
                        }
                    } else if (roomsInProgress.length && hasTooMuchEnergy(room)) {
                        let recipientName = findClosestRecipient(room, roomsInProgress);
                        let amountToSend = calculateEnergyToSend(room.name, recipientName);
                        let result = room.terminal.send(RESOURCE_ENERGY, amountToSend, recipientName);
                        if (result === OK) {
                            console.log(
                                `${room.name} sent ${amountToSend} energy to ${recipientName}: Cost: ${Game.market.calcTransactionCost(
                                    amountToSend,
                                    room.name,
                                    recipientName
                                )}`
                            );
                            return;
                        } else {
                            console.log(
                                `${room.name} was unable to send energy to ${recipientName}: ${result} Cost: ${Game.market.calcTransactionCost(
                                    amountToSend,
                                    room.name,
                                    recipientName
                                )}`
                            );
                        }
                    }
                }

                let extraResources = getExtraResources(room);
                if (extraResources.length) {
                    let sent = false;
                    extraResources.forEach((resource) => {
                        let roomsInNeed = global.resourceNeeds[resource];
                        let excessAmount = getResourceAmount(room, resource) - 10000;
                        if (roomsInNeed?.length && !sent) {
                            let recipient = findClosestRecipient(
                                room,
                                roomsInNeed.map((roomName) => Game.rooms[roomName])
                            );
                            let amountToSend = Math.max(2500, 5000 - getResourceAmount(Game.rooms[recipient], resource));
                            let result = room.terminal.send(resource, amountToSend, recipient);
                            if (result === OK) {
                                console.log(
                                    `${room.name} sent ${amountToSend} ${resource} to ${recipient}: Cost: ${Game.market.calcTransactionCost(
                                        amountToSend,
                                        room.name,
                                        recipient
                                    )}`
                                );
                                sent = true;
                                return;
                            } else {
                                console.log(
                                    `${room.name} was unable to send ${resource} to ${recipient}: ${result} Cost: ${Game.market.calcTransactionCost(
                                        amountToSend,
                                        room.name,
                                        recipient
                                    )}`
                                );
                            }
                        } else if (!sent && Game.time % 50 === 0) {
                            if (!global.qualifyingMarketOrders) {
                                getQualifyingMarketOrders();
                            }
                            let buyRequest = Game.market.getOrderById(global.qualifyingMarketOrders[resource]);
                            if (buyRequest?.amount) {
                                let amountToSell = Math.min(excessAmount, buyRequest.amount, 75000);
                                let result = room.addShipment(buyRequest.roomName, resource, amountToSell, buyRequest.id);
                                if (result === OK) {
                                    sent = true;
                                    console.log(
                                        `${room.name} added shipment of ${amountToSell} ${buyRequest.resourceType} to complete market order ${buyRequest.id}`
                                    );
                                }
                            }
                        }
                    });
                }
            }

            let readyShipmentIndex = room.memory.shipments?.findIndex((shipment) => shipmentReady(room.terminal, shipment));

            if (readyShipmentIndex > -1) {
                let shipment = room.memory.shipments[readyShipmentIndex];
                let result: ScreepsReturnCode;
                if (shipment.marketOrderId) {
                    result = Game.market.deal(shipment.marketOrderId, shipment.amount, room.name);
                    if (result === OK) {
                        room.memory.shipments.splice(readyShipmentIndex, 1);
                        console.log(
                            `${room.name} completed sale of ${shipment.amount} ${shipment.resource} for ${
                                shipment.amount * Game.market.getOrderById(shipment.marketOrderId).price
                            } credits`
                        );
                    } else {
                        console.log(`${room.name} was unable to complete sale of ${shipment.resource}: ${result}`);
                        room.memory.shipments.splice(readyShipmentIndex, 1);
                    }
                } else {
                    result = room.terminal.send(shipment.resource, shipment.amount, shipment.destinationRoom);
                    if (result === OK) {
                        room.memory.shipments.splice(readyShipmentIndex, 1);
                        console.log(`${room.name} sent ${shipment.amount} ${shipment.resource} to ${shipment.destinationRoom}`);
                    } else {
                        console.log(`${room.name} was unable to send ${shipment.resource}: ${result}`);
                    }
                }
            }
        });
}

function hasExtraEnergy(room: Room): boolean {
    return room.energyStatus > EnergyStatus.STABLE;
}

function hasTooMuchEnergy(room: Room): boolean {
    return room.energyStatus === EnergyStatus.OVERFLOW || (room.controller.level === 8 && room.energyStatus > EnergyStatus.STABLE);
}

function findClosestRecipient(sender: Room, recipients: Room[]): string {
    let distanceMap = recipients.map((room) => {
        return { name: room.name, distance: Game.map.getRoomLinearDistance(sender.name, room.name) };
    });
    let closest = distanceMap.reduce((closestSoFar, next) => (closestSoFar.distance < next.distance ? closestSoFar : next));
    return closest.name;
}

function calculateEnergyToSend(senderName: string, recipientName: string) {
    let costPerTenThousand = Game.market.calcTransactionCost(10000, senderName, recipientName);
    let sendAmount = 10000 + costPerTenThousand;
    let multiple = 1;
    while (sendAmount * (multiple + 1) < 50000) {
        multiple++;
    }

    return 10000 * multiple;
}

function getRoomResourceNeeds(room: Room): ResourceConstant[] {
    let needs = [];
    const ALL_MINERALS_AND_COMPOUNDS = [...Object.keys(MINERAL_MIN_AMOUNT), ...Object.keys(REACTION_TIME)] as ResourceConstant[];
    ALL_MINERALS_AND_COMPOUNDS.forEach((resource) => {
        if (getResourceAmount(room, resource) < 5000) {
            needs.push(resource);
        }
    });

    return needs;
}

export function getResourceAmount(room: Room, resource: ResourceConstant): number {
    return (room.storage?.store[resource] ?? 0) + (room.terminal?.store[resource] ?? 0);
}

export function getAllRoomNeeds(): { [resource: string]: string[] } {
    let needs = {};

    Object.values(Game.rooms)
        .filter((room) => room.controller?.my && room.controller.level >= 6 && room.terminal)
        .forEach((room) => {
            let roomNeeds = getRoomResourceNeeds(room);
            roomNeeds.forEach((need) => {
                needs[need] = [...(needs[need] ?? []), room.name];
            });
        });

    return needs;
}

export function getExtraResources(room: Room): ResourceConstant[] {
    let extraResources = [];

    const ALL_MINERALS_AND_COMPOUNDS = [...Object.keys(MINERAL_MIN_AMOUNT), ...Object.keys(REACTION_TIME)] as ResourceConstant[];
    ALL_MINERALS_AND_COMPOUNDS.forEach((resource) => {
        if (getResourceAmount(room, resource) > 10000 && room.terminal.store[resource] >= 5000) {
            extraResources.push(resource);
        }
    });

    return extraResources;
}

export function shipmentReady(terminal: StructureTerminal, shipment: Shipment): boolean {
    let energyNeeded =
        Game.market.calcTransactionCost(shipment.amount, terminal.room.name, shipment.destinationRoom) +
        (shipment.resource === RESOURCE_ENERGY ? shipment.amount : 0);

    return terminal.store[shipment.resource] >= shipment.amount && terminal.store.energy >= energyNeeded;
}

function getQualifyingMarketOrders() {
    let marketOrders = Game.market.getAllOrders().filter((o) => o.type === ORDER_BUY && o.price >= 0.85 * Memory.empire.priceMap[o.resourceType]);
    global.qualifyingMarketOrders = {};
    Object.keys(Memory.empire.priceMap).forEach((res) => {
        let orderId = marketOrders.find((order) => order.resourceType === res)?.id;
        if (orderId) {
            global.qualifyingMarketOrders[res] = orderId;
        }
    });
}
