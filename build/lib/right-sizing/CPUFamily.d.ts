/**
 * Represents a cloud instance.
 */
export declare class CloudInstance {
    model: string;
    vCPUs: number;
    RAM: number;
    Price: {
        [region: string]: number;
    };
    /**
     * Constructs a CloudInstance.
     * @param model The model of the instance.
     * @param vCPUs The number of virtual CPUs.
     * @param RAM The amount of RAM in GB.
     * @param Price The price of the instance in different regions.
     */
    constructor(model: string, vCPUs: number, RAM: number, Price: {
        [region: string]: number;
    });
    getPrice(region: string): number;
}
/**
 * Represents a CPU database.
 */
export declare class CPUDatabase {
    private modelToFamily;
    private familyToModels;
    private nameToInstance;
    /**
     * Retrieves an instance by model name.
     * @param modelName The model name of the instance.
     * @returns The CloudInstance corresponding to the model name, or null if not found.
     */
    getInstanceByModel(modelName: string): CloudInstance | null;
    /**
     * Loads model data from the specified path.
     * @param path The path to the JSON file containing model data.
     */
    loadModelData(path: string): Promise<void>;
    loadModelData_sync(path: string): void;
    /**
     * Retrieves the model family based on a model name.
     * @param modelName The model name of the instance.
     * @returns The array of CloudInstance instances representing the model family, or null if not found.
     */
    getModelFamily(modelName: string): CloudInstance[] | null;
    /**
     * Get all the instance families in the database.
     * This method is for testing purposes only.
     *
     * @returns An array of the family names.
     */
    getFamilies(): Map<string, CloudInstance[]>;
}
