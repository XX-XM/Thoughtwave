import { PopulationManagement } from '../modules/populationManagement';

StructureSpawn.prototype.spawnMiner = function () {
    return PopulationManagement.spawnMiner(this);
};

StructureSpawn.prototype.spawnDistributor = function () {
    return PopulationManagement.spawnDistributor(this);
};

StructureSpawn.prototype.spawnRemoteMiner = function () {
    return PopulationManagement.spawnRemoteMiner(this);
};

StructureSpawn.prototype.spawnGatherer = function () {
    return PopulationManagement.spawnGatherer(this);
};

StructureSpawn.prototype.spawnReserver = function () {
    return PopulationManagement.spawnReserver(this);
};

StructureSpawn.prototype.spawnEarlyWorker = function () {
    return PopulationManagement.spawnEarlyWorker(this);
};

StructureSpawn.prototype.spawnPhaseTwoWorker = function () {
    return PopulationManagement.spawnPhaseTwoWorker(this);
};

StructureSpawn.prototype.spawnAssignedCreep = function (assignment: SpawnAssignment) {
    return PopulationManagement.spawnAssignedCreep(this, assignment);
};

StructureSpawn.prototype.spawnFirst = function (partsBlock: BodyPartConstant[], name: string, opts?: SpawnOptions, levelCap: number = 15) {
    return PopulationManagement.spawnFirst(this, partsBlock, name, opts, levelCap);
};

StructureSpawn.prototype.spawnMax = function (partsBlock: BodyPartConstant[], name: string, opts?: SpawnOptions, levelCap: number = 15) {
    return PopulationManagement.spawnMax(this, partsBlock, name, opts, levelCap);
};

StructureSpawn.prototype.smartSpawn = function (body: BodyPartConstant[], name: string, opts?: SpawnOptions) {
    return PopulationManagement.smartSpawn(this, body, name, opts);
};

StructureSpawn.prototype.spawnManager = function () {
    return PopulationManagement.spawnManager(this);
};
