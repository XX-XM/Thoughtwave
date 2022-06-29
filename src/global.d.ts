declare global {
    //map of resources to rooms which need it
    var resourceNeeds: { [resource: string]: string[] };

    //global values shared among rooms - only one room should check constructions per tick
    var roomConstructionsChecked: boolean;

    var quadMatrix: { [key: string]: CustomMatrixCost[] }; //key is made out of roomName + orientation + anchor
}

export {};
