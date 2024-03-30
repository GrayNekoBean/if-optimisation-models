"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RightSizingModel = void 0;
const zod_1 = require("zod");
const crypto = require("crypto");
const util_1 = require("../../util/util");
const validations_1 = require("../../util/validations");
const CPUFamily_1 = require("./CPUFamily");
const path = require("path");
/**
 * Implementation of the ModelPluginInterface for the Right Sizing model.
 */
const RightSizingModel = (params) => {
    const metadata = {
        kind: 'execute'
    };
    let database = new CPUFamily_1.CPUDatabase();
    const Cache = new Map();
    const builtinDataPath = __dirname;
    const cpuMetrics = ['cpu-util', 'cloud-vendor', 'cloud-instance-type'];
    /**
     * Configures the model with the provided parameters.
     *
     * @param   configParams Configuration parameters for the model.
     */
    const configure = (configParams) => {
        // Load model data if 'data-path' is provided in configParams
        if (configParams && 'data-path' in configParams) {
            const instanceDataPath = configParams['data-path'];
            if (typeof instanceDataPath === 'string') {
                database.loadModelData_sync(instanceDataPath);
                Cache.set('custom', database); // Cache the loaded database
            }
            else {
                console.error('Error: Invalid instance data path type.');
            }
        }
    };
    // Execute the configure function
    configure(params);
    /**
     * Executes the model with the given inputs and returns the corresponding outputs.
     *
     * @param   inputs The list of input parameters for the models.
     * @return  A Promise resolving to an array of model parameters representing the outputs.
     */
    const execute = async (inputs) => {
        let outputs = [];
        // Process each input
        for (const input of inputs) {
            // Check if 'cloud-vendor' key exists in input
            if ('cloud-vendor' in input) {
                const cloudVendor = input['cloud-vendor'];
                // Check if database for the cloud vendor is cached
                if (!Cache.has(cloudVendor)) {
                    // If not cached, create a new database instance and load model data for the specific cloud vendor
                    const newDatabase = new CPUFamily_1.CPUDatabase();
                    if (cloudVendor === 'aws') {
                        console.log("path: " + builtinDataPath);
                        await newDatabase.loadModelData(path.resolve(builtinDataPath + '/aws-instances.json'));
                    }
                    else if (cloudVendor === 'azure') {
                        await newDatabase.loadModelData(path.resolve(builtinDataPath + '/azure-instances.json'));
                    }
                    Cache.set(cloudVendor, newDatabase); // Cache the loaded database
                }
                database = Cache.get(cloudVendor); // Set database to the cached one
            }
            // Process input and collect processed outputs
            let processedOutputs = processInput(input);
            outputs.push(...processedOutputs); // Append processed outputs to the outputs array
        }
        return Promise.resolve(outputs); // Resolve the promise with the outputs array
    };
    /**
     * Processes a single input to generate multiple outputs, each representing a different instance combination.
     * @param input The input parameters for the model.
     * @returns An array of model parameters representing different instance combinations.
     */
    const processInput = (input) => {
        let outputs = [];
        // Validate input and proceed if valid
        if (validateSingleInput(input)) {
            // Store original instance details
            input['old-instance'] = input['cloud-instance-type'];
            input['old-cpu-util'] = input['cpu-util'];
            input['old-mem-util'] = input['mem-util'];
            // Retrieve instance details from database
            let instance = database.getInstanceByModel(input['cloud-instance-type']);
            if (!instance) {
                throw new Error(`Invalid cloud instance: ${input['cloud-instance-type']}, not found in cloud vendor database: ${input['cloud-vendor']}`);
            }
            let util;
            let targetUtil;
            let res;
            let originalMemUtil = input['mem-util'];
            let targetRAM = (originalMemUtil / 100) * instance.RAM;
            let region = input['location'];
            let cpuUtil = input['cpu-util'];
            // Ensure cpu-util is a number
            if (typeof cpuUtil === 'number') {
                util = cpuUtil;
            }
            else if (typeof cpuUtil === 'string') {
                util = parseFloat(cpuUtil);
            }
            else {
                throw new Error('cpu-util must be a number or string');
            }
            util = util / 100; // Convert percentage to decimal
            // Set target CPU utilization to 100 if not defined
            if (typeof input['target-cpu-util'] === 'undefined') {
                targetUtil = 100;
            }
            else {
                // Ensure target-cpu-util is a number or string
                if (typeof input['target-cpu-util'] === 'number') {
                    targetUtil = input['target-cpu-util'];
                }
                else if (typeof input['target-cpu-util'] === 'string') {
                    targetUtil = parseFloat(input['target-cpu-util']);
                }
                else {
                    throw new Error('target-cpu-util must be a number or string');
                }
            }
            targetUtil = targetUtil / 100; // Convert percentage to decimal
            // Calculate right sizing for the instance
            res = calculateRightSizing(instance, util, targetUtil, targetRAM, originalMemUtil, region);
            // generate unique id to use for cases where many instances replace one
            let output_id = crypto.randomUUID();
            // Create a new output for each instance combination
            res.forEach((combination) => {
                let output = { ...input }; // Copy input to create new output
                let processedModel = combination.instance.model;
                // Update output parameters
                output['cloud-instance-type'] = processedModel;
                output['cpu-util'] = (0, util_1.fixFloat)(combination.cpuUtil * 100, 2);
                output['mem-util'] = (0, util_1.fixFloat)(combination.memUtil * 100, 2);
                output['total-memoryGB'] = combination.instance.RAM;
                if (res.length > 1) {
                    output['output-id'] = output_id;
                }
                // Determine price change
                if (combination.priceDifference > 0) {
                    output['price-change'] = `Price decreased by ${Math.ceil(combination.priceDifference)}%`;
                }
                else {
                    output['price-change'] = `Price has increased by ${Math.ceil(Math.abs(combination.priceDifference))}%`;
                }
                // Set recommendation based on processed model
                if (processedModel === input['old-instance']) {
                    output['Recommendation'] = "Size already optimal";
                }
                outputs.push(output); // Add output to outputs array
            });
        }
        else {
            outputs.push(input); // Push input unchanged if not processing
        }
        return outputs;
    };
    /**
     * Validate the input parameters object, check if the necessary parameters are present.
     *
     * @param input Input model parameters object to be validated
     * @returns True if the input is valid, false otherwise
     */
    const validateSingleInput = (input) => {
        const schema = zod_1.z
            .object({
            'cloud-instance-type': zod_1.z.string(),
            'cloud-vendor': zod_1.z.string(),
            'cpu-util': zod_1.z.number().gte(0).lte(100).or(zod_1.z.string().regex(/^[0-9]+(\.[0-9]+)?$/)),
            'target-cpu-util': zod_1.z.number().gte(0).lte(100).or(zod_1.z.string().regex(/^[0-9]+(\.[0-9]+)?$/)).optional()
        })
            .refine(validations_1.atLeastOneDefined, {
            message: `At least one of ${cpuMetrics} should present.`,
        });
        return (0, validations_1.validate)(schema, input);
    };
    /**
     * Processes a single input to generate multiple outputs, each representing a different instance combination.
     * @param index The current index in the family array.
     * @param family The sorted array of CloudInstance objects.
     * @param originalData With original cost, RAM size, required vCPUs, target cpu util, target RAM, region of the instance.
     * @param optimalData The current optimal combination data.
     * @param currentData The current state of the combination being evaluated.
     * @returns An object containing optimal combination details, closest CPU utilization difference, optimal RAM, and lowest cost.
     */
    const findOptimalCombination = (index, family, originalData, optimalData, currentData) => {
        try {
            // if index exceeds the length of the family array, return the current optimal data
            if (index >= family.length)
                return { ...optimalData };
            const instance = family[index];
            // Check if adding the current instance would exceed the RAM of original instance
            // If it exceeds, try the next one (family has been sorted in descending order).
            if (currentData.currentRAM + instance.RAM > originalData.originalRAM) {
                return findOptimalCombination(index + 1, family, originalData, optimalData, currentData);
            }
            currentData.currentCPUs += instance.vCPUs;
            currentData.currentRAM += instance.RAM;
            currentData.currentCost += instance.getPrice(originalData.region);
            currentData.combination.push(instance);
            // Check if the current combination meets the target requirements
            if (currentData.currentRAM >= originalData.targetRAM && currentData.currentCPUs >= originalData.requiredvCPUs) {
                const currentExceededCPUs = (0, util_1.fixFloat)(currentData.currentCPUs - originalData.requiredvCPUs, 5);
                const currentRAM = (0, util_1.fixFloat)(currentData.currentRAM, 5);
                const currentCost = (0, util_1.fixFloat)(currentData.currentCost, 5);
                const currentLength = currentData.combination.length;
                const optimalExceedCPU = (0, util_1.fixFloat)(optimalData.exceedCPUs, 5);
                const optimalRAM = (0, util_1.fixFloat)(optimalData.optimalRAM, 5);
                const lowestCost = (0, util_1.fixFloat)(optimalData.lowestCost, 5);
                const optimalLength = optimalData.optimalCombination.length;
                // Update optimal combination if the current combination is better
                if (currentExceededCPUs < optimalExceedCPU ||
                    (currentExceededCPUs === optimalExceedCPU && currentRAM < optimalRAM) ||
                    (currentExceededCPUs === optimalExceedCPU && currentRAM === optimalRAM && currentData.currentCost < lowestCost) ||
                    (currentExceededCPUs === optimalExceedCPU && currentRAM === optimalRAM && currentCost === lowestCost && currentLength < optimalLength)) {
                    optimalData.exceedCPUs = currentExceededCPUs;
                    optimalData.optimalRAM = currentRAM;
                    optimalData.lowestCost = currentCost;
                    let totalCPUUtil = (originalData.requiredvCPUs / currentData.currentCPUs);
                    let totalMemUtil = (originalData.targetRAM / currentData.currentRAM);
                    // Update optimal combination array
                    optimalData.optimalCombination = currentData.combination.map((instance) => {
                        return {
                            instance: instance,
                            cpuUtil: totalCPUUtil,
                            memUtil: totalMemUtil,
                            price: instance.getPrice(originalData.region),
                            priceDifference: 0
                        };
                    });
                }
            }
            // Include the instance and recurse
            optimalData = findOptimalCombination(index, family, originalData, optimalData, currentData);
            // Backtrack: Exclude the current instance and recurse
            currentData.currentCPUs -= instance.vCPUs;
            currentData.currentRAM -= instance.RAM;
            currentData.currentCost -= instance.getPrice(originalData.region);
            currentData.combination.pop();
            // Exclude the instance and recurse
            optimalData = findOptimalCombination(index + 1, family, originalData, optimalData, currentData);
        }
        catch (err) {
            throw (err);
        }
        // Return the final optimal combination details
        return { ...optimalData };
    };
    /**
     * @param cloudInstance The original cloud instance to be analyzed.
     * @param cpuUtil The current CPU utilization percentage.
     * @param targetUtil The target CPU utilization percentage.
     * @param targetRAM The target RAM size in GB.
     * @param originalMemUtil The original memory utilization percentage.
     * @param region The region where the cloud instance resides.
     * @returns An array containing the optimal combination of cloud instances along with
     *          their CPU utilization, memory utilization, RAM size, price, and price difference percentage.
     */
    const calculateRightSizing = (cloudInstance, cpuUtil, targetUtil, targetRAM, originalMemUtil, region) => {
        // Check if the cloud instance is valid
        if (!cloudInstance) {
            throw new Error(`Invalid cloud instance: ${cloudInstance}`);
        }
        // Retrieve the model family of the cloud instance
        let family = database.getModelFamily(cloudInstance.model);
        // If no model family is found, return the original instance
        if (!family || family.length === 0) {
            return [{
                    instance: cloudInstance,
                    cpuUtil: cpuUtil,
                    memUtil: originalMemUtil,
                    price: cloudInstance.getPrice(region),
                    priceDifference: 0
                }];
        }
        // Sort family in descending order based on RAM size
        family.sort((a, b) => b.RAM - a.RAM);
        // Prepare parameters for recursive findOptimalCombination.
        // original cost, RAM size, required vCPUs, target cpu util, target RAM, region of the instance
        let originalData = {
            originalCost: cloudInstance.getPrice(region),
            originalRAM: cloudInstance.RAM,
            requiredvCPUs: cpuUtil * cloudInstance.vCPUs / targetUtil,
            targetUtil: targetUtil,
            targetRAM: targetRAM,
            region: region
        };
        // Initialize an object to store the optimal data with default values
        let optimalCombination = [];
        let optimalData = {
            optimalCombination: optimalCombination,
            exceedCPUs: Number.MAX_VALUE,
            optimalRAM: Number.MAX_VALUE,
            lowestCost: Number.MAX_VALUE
        };
        // Initialize variables for the current state of the combination being evaluated
        let currentData = {
            combination: [],
            currentCPUs: 0,
            currentRAM: 0,
            currentCost: 0
        };
        // Start the recursive search for the optimal combination
        let index = 0;
        optimalData = findOptimalCombination(index, family, originalData, optimalData, currentData);
        // If an optimal combination is found
        optimalCombination = optimalData.optimalCombination;
        if (optimalCombination.length > 0) {
            // Calculate final total cost and price difference
            let finalTotalCost = optimalCombination.reduce((sum, insData) => sum + insData.instance.getPrice(region), 0);
            let priceDifference = originalData.originalCost - finalTotalCost; // This will be positive, indicating savings
            let priceDifferencePercentage = (priceDifference / originalData.originalCost) * 100;
            console.log(`Final total cost: ${finalTotalCost}, Price difference: ${priceDifference}, Price difference percentage: ${priceDifferencePercentage}`);
            // Update the optimalCombination to include the price difference percentage
            optimalCombination.forEach((insData) => {
                insData.cpuUtil = insData.cpuUtil * targetUtil;
                insData.priceDifference = priceDifferencePercentage;
            });
        }
        else {
            // If no better combination found, use the original instance
            //optimalCombination = [[cloudInstance, cpuUtil, originalMemUtil, cloudInstance.RAM, cloudInstance.getPrice(region), 0]];
            optimalCombination = [{
                    instance: cloudInstance,
                    cpuUtil: cpuUtil,
                    memUtil: originalMemUtil,
                    price: cloudInstance.getPrice(region),
                    priceDifference: 0
                }];
        }
        return optimalCombination;
    };
    /**
     * Get the databases of cloud instances.
     * This method is used for testing purposes.
     *
     * @returns The databases of cloud instances
     */
    const getDatabases = () => {
        return Cache;
    };
    return {
        metadata,
        execute,
        getDatabases
    };
};
exports.RightSizingModel = RightSizingModel;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbGliL3JpZ2h0LXNpemluZy9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw2QkFBd0I7QUFDeEIsaUNBQWlDO0FBRWpDLDBDQUEyQztBQUczQyx3REFBcUU7QUFHckUsMkNBQXlEO0FBQ3pELDZCQUE2QjtBQUU3Qjs7R0FFRztBQUNJLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxNQUFvQixFQUFtQixFQUFFO0lBRXRFLE1BQU0sUUFBUSxHQUFHO1FBQ2IsSUFBSSxFQUFFLFNBQVM7S0FDbEIsQ0FBQztJQUVGLElBQUksUUFBUSxHQUFnQixJQUFJLHVCQUFXLEVBQUUsQ0FBQztJQUM5QyxNQUFNLEtBQUssR0FBNkIsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUNsRCxNQUFNLGVBQWUsR0FBRyxTQUFTLENBQUM7SUFDbEMsTUFBTSxVQUFVLEdBQUcsQ0FBQyxVQUFVLEVBQUUsY0FBYyxFQUFFLHFCQUFxQixDQUFDLENBQUM7SUFFdkU7Ozs7T0FJRztJQUNILE1BQU0sU0FBUyxHQUFHLENBQUMsWUFBMEIsRUFBRSxFQUFFO1FBQzdDLDZEQUE2RDtRQUM3RCxJQUFJLFlBQVksSUFBSSxXQUFXLElBQUksWUFBWSxFQUFFLENBQUM7WUFDOUMsTUFBTSxnQkFBZ0IsR0FBRyxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDbkQsSUFBSSxPQUFPLGdCQUFnQixLQUFLLFFBQVEsRUFBRSxDQUFDO2dCQUN2QyxRQUFRLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztnQkFDOUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyw0QkFBNEI7WUFDL0QsQ0FBQztpQkFBTSxDQUFDO2dCQUNKLE9BQU8sQ0FBQyxLQUFLLENBQUMseUNBQXlDLENBQUMsQ0FBQztZQUM3RCxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUMs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QUMsQ0FBQTtBQWpYWSxRQUFBLGdCQUFnQixvQkFpWDVCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgeiB9IGZyb20gJ3pvZCc7XG5pbXBvcnQgKiBhcyBjcnlwdG8gZnJvbSAnY3J5cHRvJztcblxuaW1wb3J0IHsgZml4RmxvYXQgfSBmcm9tICcuLi8uLi91dGlsL3V0aWwnO1xuaW1wb3J0IHsgUGx1Z2luSW50ZXJmYWNlIH0gZnJvbSAnLi4vLi4vaW50ZXJmYWNlcyc7XG5pbXBvcnQgeyBDb25maWdQYXJhbXMsIFBsdWdpblBhcmFtcyB9IGZyb20gJy4uLy4uL3R5cGVzL2NvbW1vbic7XG5pbXBvcnQgeyB2YWxpZGF0ZSwgYXRMZWFzdE9uZURlZmluZWQgfSBmcm9tICcuLi8uLi91dGlsL3ZhbGlkYXRpb25zJztcbmltcG9ydCB7IEluc3RhbmNlRGF0YSwgQ29tYmluYXRpb25EYXRhLCBDdXJyZW50RGF0YSwgT3JpZ2luYWxEYXRhIH0gZnJvbSAnLi4vLi4vdHlwZXMvcmlnaHQtc2l6aW5nJztcblxuaW1wb3J0IHsgQ1BVRGF0YWJhc2UsIENsb3VkSW5zdGFuY2UgfSBmcm9tICcuL0NQVUZhbWlseSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIHRoZSBNb2RlbFBsdWdpbkludGVyZmFjZSBmb3IgdGhlIFJpZ2h0IFNpemluZyBtb2RlbC5cbiAqL1xuZXhwb3J0IGNvbnN0IFJpZ2h0U2l6aW5nTW9kZWwgPSAocGFyYW1zOiBDb25maWdQYXJhbXMpOiBQbHVnaW5JbnRlcmZhY2UgPT4ge1xuXG4gICAgY29uc3QgbWV0YWRhdGEgPSB7XG4gICAgICAgIGtpbmQ6ICdleGVjdXRlJ1xuICAgIH07XG5cbiAgICBsZXQgZGF0YWJhc2U6IENQVURhdGFiYXNlID0gbmV3IENQVURhdGFiYXNlKCk7XG4gICAgY29uc3QgQ2FjaGU6IE1hcDxzdHJpbmcsIENQVURhdGFiYXNlPiA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBidWlsdGluRGF0YVBhdGggPSBfX2Rpcm5hbWU7XG4gICAgY29uc3QgY3B1TWV0cmljcyA9IFsnY3B1LXV0aWwnLCAnY2xvdWQtdmVuZG9yJywgJ2Nsb3VkLWluc3RhbmNlLXR5cGUnXTtcblxuICAgIC8qKlxuICAgICAqIENvbmZpZ3VyZXMgdGhlIG1vZGVsIHdpdGggdGhlIHByb3ZpZGVkIHBhcmFtZXRlcnMuXG4gICAgICogXG4gICAgICogQHBhcmFtICAgY29uZmlnUGFyYW1zIENvbmZpZ3VyYXRpb24gcGFyYW1ldGVycyBmb3IgdGhlIG1vZGVsLlxuICAgICAqL1xuICAgIGNvbnN0IGNvbmZpZ3VyZSA9IChjb25maWdQYXJhbXM6IENvbmZpZ1BhcmFtcykgPT4ge1xuICAgICAgICAvLyBMb2FkIG1vZGVsIGRhdGEgaWYgJ2RhdGEtcGF0aCcgaXMgcHJvdmlkZWQgaW4gY29uZmlnUGFyYW1zXG4gICAgICAgIGlmIChjb25maWdQYXJhbXMgJiYgJ2RhdGEtcGF0aCcgaW4gY29uZmlnUGFyYW1zKSB7XG4gICAgICAgICAgICBjb25zdCBpbnN0YW5jZURhdGFQYXRoID0gY29uZmlnUGFyYW1zWydkYXRhLXBhdGgnXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaW5zdGFuY2VEYXRhUGF0aCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBkYXRhYmFzZS5sb2FkTW9kZWxEYXRhX3N5bmMoaW5zdGFuY2VEYXRhUGF0aCk7XG4gICAgICAgICAgICAgICAgQ2FjaGUuc2V0KCdjdXN0b20nLCBkYXRhYmFzZSk7IC8vIENhY2hlIHRoZSBsb2FkZWQgZGF0YWJhc2VcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3I6IEludmFsaWQgaW5zdGFuY2UgZGF0YSBwYXRoIHR5cGUuJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gRXhlY3V0ZSB0aGUgY29uZmlndXJlIGZ1bmN0aW9uXG4gICAgY29uZmlndXJlKHBhcmFtcyk7XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlcyB0aGUgbW9kZWwgd2l0aCB0aGUgZ2l2ZW4gaW5wdXRzIGFuZCByZXR1cm5zIHRoZSBjb3JyZXNwb25kaW5nIG91dHB1dHMuXG4gICAgICogXG4gICAgICogQHBhcmFtICAgaW5wdXRzIFRoZSBsaXN0IG9mIGlucHV0IHBhcmFtZXRlcnMgZm9yIHRoZSBtb2RlbHMuXG4gICAgICogQHJldHVybiAgQSBQcm9taXNlIHJlc29sdmluZyB0byBhbiBhcnJheSBvZiBtb2RlbCBwYXJhbWV0ZXJzIHJlcHJlc2VudGluZyB0aGUgb3V0cHV0cy5cbiAgICAgKi9cbiAgICBjb25zdCBleGVjdXRlID0gYXN5bmMgKGlucHV0czogUGx1Z2luUGFyYW1zW10pID0+IHtcbiAgICAgICAgbGV0IG91dHB1dHM6IFBsdWdpblBhcmFtc1tdID0gW107XG5cbiAgICAgICAgLy8gUHJvY2VzcyBlYWNoIGlucHV0XG4gICAgICAgIGZvciAoY29uc3QgaW5wdXQgb2YgaW5wdXRzKSB7XG4gICAgICAgICAgICAvLyBDaGVjayBpZiAnY2xvdWQtdmVuZG9yJyBrZXkgZXhpc3RzIGluIGlucHV0XG4gICAgICAgICAgICBpZiAoJ2Nsb3VkLXZlbmRvcicgaW4gaW5wdXQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjbG91ZFZlbmRvciA9IGlucHV0WydjbG91ZC12ZW5kb3InXTtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBkYXRhYmFzZSBmb3IgdGhlIGNsb3VkIHZlbmRvciBpcyBjYWNoZWRcbiAgICAgICAgICAgICAgICBpZiAoIUNhY2hlLmhhcyhjbG91ZFZlbmRvcikpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgbm90IGNhY2hlZCwgY3JlYXRlIGEgbmV3IGRhdGFiYXNlIGluc3RhbmNlIGFuZCBsb2FkIG1vZGVsIGRhdGEgZm9yIHRoZSBzcGVjaWZpYyBjbG91ZCB2ZW5kb3JcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3RGF0YWJhc2UgPSBuZXcgQ1BVRGF0YWJhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNsb3VkVmVuZG9yID09PSAnYXdzJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJwYXRoOiBcIiArIGJ1aWx0aW5EYXRhUGF0aCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBuZXdEYXRhYmFzZS5sb2FkTW9kZWxEYXRhKHBhdGgucmVzb2x2ZShidWlsdGluRGF0YVBhdGggKyAnL2F3cy1pbnN0YW5jZXMuanNvbicpKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjbG91ZFZlbmRvciA9PT0gJ2F6dXJlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3RGF0YWJhc2UubG9hZE1vZGVsRGF0YShwYXRoLnJlc29sdmUoYnVpbHRpbkRhdGFQYXRoICsgJy9henVyZS1pbnN0YW5jZXMuanNvbicpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBDYWNoZS5zZXQoY2xvdWRWZW5kb3IsIG5ld0RhdGFiYXNlKTsgLy8gQ2FjaGUgdGhlIGxvYWRlZCBkYXRhYmFzZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkYXRhYmFzZSA9IENhY2hlLmdldChjbG91ZFZlbmRvcikhOyAvLyBTZXQgZGF0YWJhc2UgdG8gdGhlIGNhY2hlZCBvbmVcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUHJvY2VzcyBpbnB1dCBhbmQgY29sbGVjdCBwcm9jZXNzZWQgb3V0cHV0c1xuICAgICAgICAgICAgbGV0IHByb2Nlc3NlZE91dHB1dHMgPSBwcm9jZXNzSW5wdXQoaW5wdXQpO1xuICAgICAgICAgICAgb3V0cHV0cy5wdXNoKC4uLnByb2Nlc3NlZE91dHB1dHMpOyAvLyBBcHBlbmQgcHJvY2Vzc2VkIG91dHB1dHMgdG8gdGhlIG91dHB1dHMgYXJyYXlcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUob3V0cHV0cyk7IC8vIFJlc29sdmUgdGhlIHByb21pc2Ugd2l0aCB0aGUgb3V0cHV0cyBhcnJheVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFByb2Nlc3NlcyBhIHNpbmdsZSBpbnB1dCB0byBnZW5lcmF0ZSBtdWx0aXBsZSBvdXRwdXRzLCBlYWNoIHJlcHJlc2VudGluZyBhIGRpZmZlcmVudCBpbnN0YW5jZSBjb21iaW5hdGlvbi5cbiAgICAgKiBAcGFyYW0gaW5wdXQgVGhlIGlucHV0IHBhcmFtZXRlcnMgZm9yIHRoZSBtb2RlbC5cbiAgICAgKiBAcmV0dXJucyBBbiBhcnJheSBvZiBtb2RlbCBwYXJhbWV0ZXJzIHJlcHJlc2VudGluZyBkaWZmZXJlbnQgaW5zdGFuY2UgY29tYmluYXRpb25zLlxuICAgICAqL1xuICAgIGNvbnN0IHByb2Nlc3NJbnB1dCA9IChpbnB1dDogUGx1Z2luUGFyYW1zKTogUGx1Z2luUGFyYW1zW10gPT4ge1xuICAgICAgICBsZXQgb3V0cHV0czogUGx1Z2luUGFyYW1zW10gPSBbXTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBpbnB1dCBhbmQgcHJvY2VlZCBpZiB2YWxpZFxuICAgICAgICBpZiAodmFsaWRhdGVTaW5nbGVJbnB1dChpbnB1dCkpIHtcbiAgICAgICAgICAgIC8vIFN0b3JlIG9yaWdpbmFsIGluc3RhbmNlIGRldGFpbHNcbiAgICAgICAgICAgIGlucHV0WydvbGQtaW5zdGFuY2UnXSA9IGlucHV0WydjbG91ZC1pbnN0YW5jZS10eXBlJ107XG4gICAgICAgICAgICBpbnB1dFsnb2xkLWNwdS11dGlsJ10gPSBpbnB1dFsnY3B1LXV0aWwnXTtcbiAgICAgICAgICAgIGlucHV0WydvbGQtbWVtLXV0aWwnXSA9IGlucHV0WydtZW0tdXRpbCddO1xuXG4gICAgICAgICAgICAvLyBSZXRyaWV2ZSBpbnN0YW5jZSBkZXRhaWxzIGZyb20gZGF0YWJhc2VcbiAgICAgICAgICAgIGxldCBpbnN0YW5jZSA9IGRhdGFiYXNlLmdldEluc3RhbmNlQnlNb2RlbChpbnB1dFsnY2xvdWQtaW5zdGFuY2UtdHlwZSddKTtcbiAgICAgICAgICAgIGlmICghaW5zdGFuY2UpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgY2xvdWQgaW5zdGFuY2U6ICR7aW5wdXRbJ2Nsb3VkLWluc3RhbmNlLXR5cGUnXX0sIG5vdCBmb3VuZCBpbiBjbG91ZCB2ZW5kb3IgZGF0YWJhc2U6ICR7aW5wdXRbJ2Nsb3VkLXZlbmRvciddfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGV0IHV0aWw6IG51bWJlcjtcbiAgICAgICAgICAgIGxldCB0YXJnZXRVdGlsOiBudW1iZXI7XG4gICAgICAgICAgICBsZXQgcmVzOiBJbnN0YW5jZURhdGFbXTtcbiAgICAgICAgICAgIGxldCBvcmlnaW5hbE1lbVV0aWwgPSBpbnB1dFsnbWVtLXV0aWwnXTtcbiAgICAgICAgICAgIGxldCB0YXJnZXRSQU0gPSAob3JpZ2luYWxNZW1VdGlsIC8gMTAwKSAqIGluc3RhbmNlLlJBTTtcbiAgICAgICAgICAgIGxldCByZWdpb24gPSBpbnB1dFsnbG9jYXRpb24nXTtcblxuICAgICAgICAgICAgbGV0IGNwdVV0aWwgPSBpbnB1dFsnY3B1LXV0aWwnXTtcbiAgICAgICAgICAgIC8vIEVuc3VyZSBjcHUtdXRpbCBpcyBhIG51bWJlclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjcHVVdGlsID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgIHV0aWwgPSBjcHVVdGlsIGFzIG51bWJlcjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNwdVV0aWwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgdXRpbCA9IHBhcnNlRmxvYXQoY3B1VXRpbCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignY3B1LXV0aWwgbXVzdCBiZSBhIG51bWJlciBvciBzdHJpbmcnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHV0aWwgPSB1dGlsIC8gMTAwOyAvLyBDb252ZXJ0IHBlcmNlbnRhZ2UgdG8gZGVjaW1hbFxuXG4gICAgICAgICAgICAvLyBTZXQgdGFyZ2V0IENQVSB1dGlsaXphdGlvbiB0byAxMDAgaWYgbm90IGRlZmluZWRcbiAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRbJ3RhcmdldC1jcHUtdXRpbCddID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIHRhcmdldFV0aWwgPSAxMDA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEVuc3VyZSB0YXJnZXQtY3B1LXV0aWwgaXMgYSBudW1iZXIgb3Igc3RyaW5nXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBpbnB1dFsndGFyZ2V0LWNwdS11dGlsJ10gPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFV0aWwgPSBpbnB1dFsndGFyZ2V0LWNwdS11dGlsJ10gYXMgbnVtYmVyO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGlucHV0Wyd0YXJnZXQtY3B1LXV0aWwnXSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0VXRpbCA9IHBhcnNlRmxvYXQoaW5wdXRbJ3RhcmdldC1jcHUtdXRpbCddKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3RhcmdldC1jcHUtdXRpbCBtdXN0IGJlIGEgbnVtYmVyIG9yIHN0cmluZycpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRhcmdldFV0aWwgPSB0YXJnZXRVdGlsIC8gMTAwOyAvLyBDb252ZXJ0IHBlcmNlbnRhZ2UgdG8gZGVjaW1hbFxuXG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgcmlnaHQgc2l6aW5nIGZvciB0aGUgaW5zdGFuY2VcbiAgICAgICAgICAgIHJlcyA9IGNhbGN1bGF0ZVJpZ2h0U2l6aW5nKGluc3RhbmNlLCB1dGlsLCB0YXJnZXRVdGlsLCB0YXJnZXRSQU0sIG9yaWdpbmFsTWVtVXRpbCwgcmVnaW9uKTtcblxuICAgICAgICAgICAgLy8gZ2VuZXJhdGUgdW5pcXVlIGlkIHRvIHVzZSBmb3IgY2FzZXMgd2hlcmUgbWFueSBpbnN0YW5jZXMgcmVwbGFjZSBvbmVcbiAgICAgICAgICAgIGxldCBvdXRwdXRfaWQgPSBjcnlwdG8ucmFuZG9tVVVJRCgpO1xuXG4gICAgICAgICAgICAvLyBDcmVhdGUgYSBuZXcgb3V0cHV0IGZvciBlYWNoIGluc3RhbmNlIGNvbWJpbmF0aW9uXG4gICAgICAgICAgICByZXMuZm9yRWFjaCgoY29tYmluYXRpb24pID0+IHtcbiAgICAgICAgICAgICAgICBsZXQgb3V0cHV0ID0geyAuLi5pbnB1dCB9OyAvLyBDb3B5IGlucHV0IHRvIGNyZWF0ZSBuZXcgb3V0cHV0XG4gICAgICAgICAgICAgICAgbGV0IHByb2Nlc3NlZE1vZGVsID0gY29tYmluYXRpb24uaW5zdGFuY2UubW9kZWw7XG5cbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgb3V0cHV0IHBhcmFtZXRlcnNcbiAgICAgICAgICAgICAgICBvdXRwdXRbJ2Nsb3VkLWluc3RhbmNlLXR5cGUnXSA9IHByb2Nlc3NlZE1vZGVsO1xuICAgICAgICAgICAgICAgIG91dHB1dFsnY3B1LXV0aWwnXSA9IGZpeEZsb2F0KGNvbWJpbmF0aW9uLmNwdVV0aWwgKiAxMDAsIDIpO1xuICAgICAgICAgICAgICAgIG91dHB1dFsnbWVtLXV0aWwnXSA9IGZpeEZsb2F0KGNvbWJpbmF0aW9uLm1lbVV0aWwgKiAxMDAsIDIpO1xuICAgICAgICAgICAgICAgIG91dHB1dFsndG90YWwtbWVtb3J5R0InXSA9IGNvbWJpbmF0aW9uLmluc3RhbmNlLlJBTTtcbiAgICAgICAgICAgICAgICBpZiAocmVzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0WydvdXRwdXQtaWQnXSA9IG91dHB1dF9pZFxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIERldGVybWluZSBwcmljZSBjaGFuZ2VcbiAgICAgICAgICAgICAgICBpZiAoY29tYmluYXRpb24ucHJpY2VEaWZmZXJlbmNlID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBvdXRwdXRbJ3ByaWNlLWNoYW5nZSddID0gYFByaWNlIGRlY3JlYXNlZCBieSAke01hdGguY2VpbChjb21iaW5hdGlvbi5wcmljZURpZmZlcmVuY2UpfSVgO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG91dHB1dFsncHJpY2UtY2hhbmdlJ10gPSBgUHJpY2UgaGFzIGluY3JlYXNlZCBieSAke01hdGguY2VpbChNYXRoLmFicyhjb21iaW5hdGlvbi5wcmljZURpZmZlcmVuY2UpKX0lYDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBTZXQgcmVjb21tZW5kYXRpb24gYmFzZWQgb24gcHJvY2Vzc2VkIG1vZGVsXG4gICAgICAgICAgICAgICAgaWYgKHByb2Nlc3NlZE1vZGVsID09PSBpbnB1dFsnb2xkLWluc3RhbmNlJ10pIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0WydSZWNvbW1lbmRhdGlvbiddID0gXCJTaXplIGFscmVhZHkgb3B0aW1hbFwiO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIG91dHB1dHMucHVzaChvdXRwdXQpOyAvLyBBZGQgb3V0cHV0IHRvIG91dHB1dHMgYXJyYXlcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb3V0cHV0cy5wdXNoKGlucHV0KTsgLy8gUHVzaCBpbnB1dCB1bmNoYW5nZWQgaWYgbm90IHByb2Nlc3NpbmdcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvdXRwdXRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFZhbGlkYXRlIHRoZSBpbnB1dCBwYXJhbWV0ZXJzIG9iamVjdCwgY2hlY2sgaWYgdGhlIG5lY2Vzc2FyeSBwYXJhbWV0ZXJzIGFyZSBwcmVzZW50LlxuICAgICAqIFxuICAgICAqIEBwYXJhbSBpbnB1dCBJbnB1dCBtb2RlbCBwYXJhbWV0ZXJzIG9iamVjdCB0byBiZSB2YWxpZGF0ZWRcbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSBpbnB1dCBpcyB2YWxpZCwgZmFsc2Ugb3RoZXJ3aXNlXG4gICAgICovXG4gICAgY29uc3QgdmFsaWRhdGVTaW5nbGVJbnB1dCA9IChpbnB1dDogUGx1Z2luUGFyYW1zKSA9PiB7XG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IHpcbiAgICAgICAgLm9iamVjdCh7XG4gICAgICAgICAgICAnY2xvdWQtaW5zdGFuY2UtdHlwZSc6IHouc3RyaW5nKCksXG4gICAgICAgICAgICAnY2xvdWQtdmVuZG9yJzogei5zdHJpbmcoKSxcbiAgICAgICAgICAgICdjcHUtdXRpbCc6IHoubnVtYmVyKCkuZ3RlKDApLmx0ZSgxMDApLm9yKHouc3RyaW5nKCkucmVnZXgoL15bMC05XSsoXFwuWzAtOV0rKT8kLykpLFxuICAgICAgICAgICAgJ3RhcmdldC1jcHUtdXRpbCc6IHoubnVtYmVyKCkuZ3RlKDApLmx0ZSgxMDApLm9yKHouc3RyaW5nKCkucmVnZXgoL15bMC05XSsoXFwuWzAtOV0rKT8kLykpLm9wdGlvbmFsKClcbiAgICAgICAgfSlcbiAgICAgICAgLnJlZmluZShhdExlYXN0T25lRGVmaW5lZCwge1xuICAgICAgICAgICAgbWVzc2FnZTogYEF0IGxlYXN0IG9uZSBvZiAke2NwdU1ldHJpY3N9IHNob3VsZCBwcmVzZW50LmAsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB2YWxpZGF0ZTx6LmluZmVyPHR5cGVvZiBzY2hlbWE+PihzY2hlbWEsIGlucHV0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQcm9jZXNzZXMgYSBzaW5nbGUgaW5wdXQgdG8gZ2VuZXJhdGUgbXVsdGlwbGUgb3V0cHV0cywgZWFjaCByZXByZXNlbnRpbmcgYSBkaWZmZXJlbnQgaW5zdGFuY2UgY29tYmluYXRpb24uXG4gICAgICogQHBhcmFtIGluZGV4IFRoZSBjdXJyZW50IGluZGV4IGluIHRoZSBmYW1pbHkgYXJyYXkuXG4gICAgICogQHBhcmFtIGZhbWlseSBUaGUgc29ydGVkIGFycmF5IG9mIENsb3VkSW5zdGFuY2Ugb2JqZWN0cy5cbiAgICAgKiBAcGFyYW0gb3JpZ2luYWxEYXRhIFdpdGggb3JpZ2luYWwgY29zdCwgUkFNIHNpemUsIHJlcXVpcmVkIHZDUFVzLCB0YXJnZXQgY3B1IHV0aWwsIHRhcmdldCBSQU0sIHJlZ2lvbiBvZiB0aGUgaW5zdGFuY2UuXG4gICAgICogQHBhcmFtIG9wdGltYWxEYXRhIFRoZSBjdXJyZW50IG9wdGltYWwgY29tYmluYXRpb24gZGF0YS5cbiAgICAgKiBAcGFyYW0gY3VycmVudERhdGEgVGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIGNvbWJpbmF0aW9uIGJlaW5nIGV2YWx1YXRlZC5cbiAgICAgKiBAcmV0dXJucyBBbiBvYmplY3QgY29udGFpbmluZyBvcHRpbWFsIGNvbWJpbmF0aW9uIGRldGFpbHMsIGNsb3Nlc3QgQ1BVIHV0aWxpemF0aW9uIGRpZmZlcmVuY2UsIG9wdGltYWwgUkFNLCBhbmQgbG93ZXN0IGNvc3QuXG4gICAgICovXG4gICAgY29uc3QgZmluZE9wdGltYWxDb21iaW5hdGlvbiA9IChpbmRleDogbnVtYmVyLCBmYW1pbHk6IENsb3VkSW5zdGFuY2VbXSwgXG4gICAgICAgIG9yaWdpbmFsRGF0YTogT3JpZ2luYWxEYXRhLCBvcHRpbWFsRGF0YTogQ29tYmluYXRpb25EYXRhLCBjdXJyZW50RGF0YTogQ3VycmVudERhdGEpOiBDb21iaW5hdGlvbkRhdGEgPT4ge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBpZiBpbmRleCBleGNlZWRzIHRoZSBsZW5ndGggb2YgdGhlIGZhbWlseSBhcnJheSwgcmV0dXJuIHRoZSBjdXJyZW50IG9wdGltYWwgZGF0YVxuICAgICAgICAgICAgICAgIGlmIChpbmRleCA+PSBmYW1pbHkubGVuZ3RoKSByZXR1cm4geyAuLi5vcHRpbWFsRGF0YSB9XG4gICAgICAgICAgICAgICAgY29uc3QgaW5zdGFuY2UgPSBmYW1pbHlbaW5kZXhdO1xuICAgIFxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIGFkZGluZyB0aGUgY3VycmVudCBpbnN0YW5jZSB3b3VsZCBleGNlZWQgdGhlIFJBTSBvZiBvcmlnaW5hbCBpbnN0YW5jZVxuICAgICAgICAgICAgICAgIC8vIElmIGl0IGV4Y2VlZHMsIHRyeSB0aGUgbmV4dCBvbmUgKGZhbWlseSBoYXMgYmVlbiBzb3J0ZWQgaW4gZGVzY2VuZGluZyBvcmRlcikuXG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnREYXRhLmN1cnJlbnRSQU0gKyBpbnN0YW5jZS5SQU0gPiBvcmlnaW5hbERhdGEub3JpZ2luYWxSQU0pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbmRPcHRpbWFsQ29tYmluYXRpb24oaW5kZXggKyAxLCBmYW1pbHksIG9yaWdpbmFsRGF0YSwgb3B0aW1hbERhdGEsIGN1cnJlbnREYXRhKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgXG4gICAgICAgICAgICAgICAgY3VycmVudERhdGEuY3VycmVudENQVXMgKz0gaW5zdGFuY2UudkNQVXM7XG4gICAgICAgICAgICAgICAgY3VycmVudERhdGEuY3VycmVudFJBTSArPSBpbnN0YW5jZS5SQU07XG4gICAgICAgICAgICAgICAgY3VycmVudERhdGEuY3VycmVudENvc3QgKz0gaW5zdGFuY2UuZ2V0UHJpY2Uob3JpZ2luYWxEYXRhLnJlZ2lvbik7XG4gICAgICAgICAgICAgICAgY3VycmVudERhdGEuY29tYmluYXRpb24ucHVzaChpbnN0YW5jZSk7XG4gICAgXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGN1cnJlbnQgY29tYmluYXRpb24gbWVldHMgdGhlIHRhcmdldCByZXF1aXJlbWVudHNcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudERhdGEuY3VycmVudFJBTSA+PSBvcmlnaW5hbERhdGEudGFyZ2V0UkFNICYmIGN1cnJlbnREYXRhLmN1cnJlbnRDUFVzID49IG9yaWdpbmFsRGF0YS5yZXF1aXJlZHZDUFVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRFeGNlZWRlZENQVXMgPSBmaXhGbG9hdChjdXJyZW50RGF0YS5jdXJyZW50Q1BVcyAtIG9yaWdpbmFsRGF0YS5yZXF1aXJlZHZDUFVzLCA1KVxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50UkFNID0gZml4RmxvYXQoY3VycmVudERhdGEuY3VycmVudFJBTSwgNSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRDb3N0ID0gZml4RmxvYXQoY3VycmVudERhdGEuY3VycmVudENvc3QsIDUpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50TGVuZ3RoID0gY3VycmVudERhdGEuY29tYmluYXRpb24ubGVuZ3RoO1xuICAgIFxuICAgICAgICAgICAgICAgICAgICBjb25zdCBvcHRpbWFsRXhjZWVkQ1BVID0gZml4RmxvYXQob3B0aW1hbERhdGEuZXhjZWVkQ1BVcywgNSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG9wdGltYWxSQU0gPSBmaXhGbG9hdChvcHRpbWFsRGF0YS5vcHRpbWFsUkFNLCA1KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG93ZXN0Q29zdCA9IGZpeEZsb2F0KG9wdGltYWxEYXRhLmxvd2VzdENvc3QsIDUpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvcHRpbWFsTGVuZ3RoID0gb3B0aW1hbERhdGEub3B0aW1hbENvbWJpbmF0aW9uLmxlbmd0aDtcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgLy8gVXBkYXRlIG9wdGltYWwgY29tYmluYXRpb24gaWYgdGhlIGN1cnJlbnQgY29tYmluYXRpb24gaXMgYmV0dGVyXG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50RXhjZWVkZWRDUFVzIDwgb3B0aW1hbEV4Y2VlZENQVSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgKGN1cnJlbnRFeGNlZWRlZENQVXMgPT09IG9wdGltYWxFeGNlZWRDUFUgJiYgY3VycmVudFJBTSA8IG9wdGltYWxSQU0pIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAoY3VycmVudEV4Y2VlZGVkQ1BVcyA9PT0gb3B0aW1hbEV4Y2VlZENQVSAmJiBjdXJyZW50UkFNID09PSBvcHRpbWFsUkFNICYmIGN1cnJlbnREYXRhLmN1cnJlbnRDb3N0IDwgbG93ZXN0Q29zdCkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIChjdXJyZW50RXhjZWVkZWRDUFVzID09PSBvcHRpbWFsRXhjZWVkQ1BVICYmIGN1cnJlbnRSQU0gPT09IG9wdGltYWxSQU0gJiYgY3VycmVudENvc3QgPT09IGxvd2VzdENvc3QgJiYgY3VycmVudExlbmd0aCA8IG9wdGltYWxMZW5ndGgpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpbWFsRGF0YS5leGNlZWRDUFVzID0gY3VycmVudEV4Y2VlZGVkQ1BVcztcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGltYWxEYXRhLm9wdGltYWxSQU0gPSBjdXJyZW50UkFNO1xuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW1hbERhdGEubG93ZXN0Q29zdCA9IGN1cnJlbnRDb3N0O1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHRvdGFsQ1BVVXRpbCA9IChvcmlnaW5hbERhdGEucmVxdWlyZWR2Q1BVcyAvIGN1cnJlbnREYXRhLmN1cnJlbnRDUFVzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0b3RhbE1lbVV0aWwgPSAob3JpZ2luYWxEYXRhLnRhcmdldFJBTSAvIGN1cnJlbnREYXRhLmN1cnJlbnRSQU0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVXBkYXRlIG9wdGltYWwgY29tYmluYXRpb24gYXJyYXlcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGltYWxEYXRhLm9wdGltYWxDb21iaW5hdGlvbiA9IGN1cnJlbnREYXRhLmNvbWJpbmF0aW9uLm1hcCgoaW5zdGFuY2U6IENsb3VkSW5zdGFuY2UpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnN0YW5jZTogaW5zdGFuY2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNwdVV0aWw6IHRvdGFsQ1BVVXRpbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWVtVXRpbDogdG90YWxNZW1VdGlsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmljZTogaW5zdGFuY2UuZ2V0UHJpY2Uob3JpZ2luYWxEYXRhLnJlZ2lvbiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByaWNlRGlmZmVyZW5jZTogMFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgICAgIC8vIEluY2x1ZGUgdGhlIGluc3RhbmNlIGFuZCByZWN1cnNlXG4gICAgICAgICAgICAgICAgb3B0aW1hbERhdGEgPSBmaW5kT3B0aW1hbENvbWJpbmF0aW9uKGluZGV4LCBmYW1pbHksIG9yaWdpbmFsRGF0YSwgb3B0aW1hbERhdGEsIGN1cnJlbnREYXRhKTtcbiAgICBcbiAgICAgICAgICAgICAgICAvLyBCYWNrdHJhY2s6IEV4Y2x1ZGUgdGhlIGN1cnJlbnQgaW5zdGFuY2UgYW5kIHJlY3Vyc2VcbiAgICAgICAgICAgICAgICBjdXJyZW50RGF0YS5jdXJyZW50Q1BVcyAtPSBpbnN0YW5jZS52Q1BVcztcbiAgICAgICAgICAgICAgICBjdXJyZW50RGF0YS5jdXJyZW50UkFNIC09IGluc3RhbmNlLlJBTTtcbiAgICAgICAgICAgICAgICBjdXJyZW50RGF0YS5jdXJyZW50Q29zdCAtPSBpbnN0YW5jZS5nZXRQcmljZShvcmlnaW5hbERhdGEucmVnaW9uKTtcbiAgICAgICAgICAgICAgICBjdXJyZW50RGF0YS5jb21iaW5hdGlvbi5wb3AoKTtcbiAgICBcbiAgICAgICAgICAgICAgICAvLyBFeGNsdWRlIHRoZSBpbnN0YW5jZSBhbmQgcmVjdXJzZVxuICAgICAgICAgICAgICAgIG9wdGltYWxEYXRhID0gZmluZE9wdGltYWxDb21iaW5hdGlvbihpbmRleCArIDEsIGZhbWlseSwgb3JpZ2luYWxEYXRhLCBvcHRpbWFsRGF0YSwgY3VycmVudERhdGEpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgKGVycilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFJldHVybiB0aGUgZmluYWwgb3B0aW1hbCBjb21iaW5hdGlvbiBkZXRhaWxzXG4gICAgICAgICAgICByZXR1cm4geyAuLi5vcHRpbWFsRGF0YSB9O1xuICAgICAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gY2xvdWRJbnN0YW5jZSBUaGUgb3JpZ2luYWwgY2xvdWQgaW5zdGFuY2UgdG8gYmUgYW5hbHl6ZWQuXG4gICAgICogQHBhcmFtIGNwdVV0aWwgVGhlIGN1cnJlbnQgQ1BVIHV0aWxpemF0aW9uIHBlcmNlbnRhZ2UuXG4gICAgICogQHBhcmFtIHRhcmdldFV0aWwgVGhlIHRhcmdldCBDUFUgdXRpbGl6YXRpb24gcGVyY2VudGFnZS5cbiAgICAgKiBAcGFyYW0gdGFyZ2V0UkFNIFRoZSB0YXJnZXQgUkFNIHNpemUgaW4gR0IuXG4gICAgICogQHBhcmFtIG9yaWdpbmFsTWVtVXRpbCBUaGUgb3JpZ2luYWwgbWVtb3J5IHV0aWxpemF0aW9uIHBlcmNlbnRhZ2UuXG4gICAgICogQHBhcmFtIHJlZ2lvbiBUaGUgcmVnaW9uIHdoZXJlIHRoZSBjbG91ZCBpbnN0YW5jZSByZXNpZGVzLlxuICAgICAqIEByZXR1cm5zIEFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIG9wdGltYWwgY29tYmluYXRpb24gb2YgY2xvdWQgaW5zdGFuY2VzIGFsb25nIHdpdGhcbiAgICAgKiAgICAgICAgICB0aGVpciBDUFUgdXRpbGl6YXRpb24sIG1lbW9yeSB1dGlsaXphdGlvbiwgUkFNIHNpemUsIHByaWNlLCBhbmQgcHJpY2UgZGlmZmVyZW5jZSBwZXJjZW50YWdlLlxuICAgICAqL1xuICAgIGNvbnN0IGNhbGN1bGF0ZVJpZ2h0U2l6aW5nID0gKGNsb3VkSW5zdGFuY2U6IENsb3VkSW5zdGFuY2UsIGNwdVV0aWw6IG51bWJlciwgdGFyZ2V0VXRpbDogbnVtYmVyLCBcbiAgICAgICAgdGFyZ2V0UkFNOiBudW1iZXIsIG9yaWdpbmFsTWVtVXRpbDogbnVtYmVyLCByZWdpb246IHN0cmluZyk6IEluc3RhbmNlRGF0YVtdID0+IHtcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGNsb3VkIGluc3RhbmNlIGlzIHZhbGlkXG4gICAgICAgIGlmICghY2xvdWRJbnN0YW5jZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGNsb3VkIGluc3RhbmNlOiAke2Nsb3VkSW5zdGFuY2V9YCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZXRyaWV2ZSB0aGUgbW9kZWwgZmFtaWx5IG9mIHRoZSBjbG91ZCBpbnN0YW5jZVxuICAgICAgICBsZXQgZmFtaWx5ID0gZGF0YWJhc2UuZ2V0TW9kZWxGYW1pbHkoY2xvdWRJbnN0YW5jZS5tb2RlbCk7XG4gICAgICAgIC8vIElmIG5vIG1vZGVsIGZhbWlseSBpcyBmb3VuZCwgcmV0dXJuIHRoZSBvcmlnaW5hbCBpbnN0YW5jZVxuICAgICAgICBpZiAoIWZhbWlseSB8fCBmYW1pbHkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gW3tcbiAgICAgICAgICAgICAgICBpbnN0YW5jZTogY2xvdWRJbnN0YW5jZSxcbiAgICAgICAgICAgICAgICBjcHVVdGlsOiBjcHVVdGlsLFxuICAgICAgICAgICAgICAgIG1lbVV0aWw6IG9yaWdpbmFsTWVtVXRpbCxcbiAgICAgICAgICAgICAgICBwcmljZTogY2xvdWRJbnN0YW5jZS5nZXRQcmljZShyZWdpb24pLFxuICAgICAgICAgICAgICAgIHByaWNlRGlmZmVyZW5jZTogMFxuICAgICAgICAgICAgfV07XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTb3J0IGZhbWlseSBpbiBkZXNjZW5kaW5nIG9yZGVyIGJhc2VkIG9uIFJBTSBzaXplXG4gICAgICAgIGZhbWlseS5zb3J0KChhLCBiKSA9PiBiLlJBTSAtIGEuUkFNKTtcblxuICAgICAgICAvLyBQcmVwYXJlIHBhcmFtZXRlcnMgZm9yIHJlY3Vyc2l2ZSBmaW5kT3B0aW1hbENvbWJpbmF0aW9uLlxuICAgICAgICAvLyBvcmlnaW5hbCBjb3N0LCBSQU0gc2l6ZSwgcmVxdWlyZWQgdkNQVXMsIHRhcmdldCBjcHUgdXRpbCwgdGFyZ2V0IFJBTSwgcmVnaW9uIG9mIHRoZSBpbnN0YW5jZVxuICAgICAgICBsZXQgb3JpZ2luYWxEYXRhOiBPcmlnaW5hbERhdGEgPSB7XG4gICAgICAgICAgICBvcmlnaW5hbENvc3Q6IGNsb3VkSW5zdGFuY2UuZ2V0UHJpY2UocmVnaW9uKSxcbiAgICAgICAgICAgIG9yaWdpbmFsUkFNOiBjbG91ZEluc3RhbmNlLlJBTSxcbiAgICAgICAgICAgIHJlcXVpcmVkdkNQVXM6IGNwdVV0aWwgKiBjbG91ZEluc3RhbmNlLnZDUFVzIC8gdGFyZ2V0VXRpbCxcbiAgICAgICAgICAgIHRhcmdldFV0aWw6IHRhcmdldFV0aWwsXG4gICAgICAgICAgICB0YXJnZXRSQU06IHRhcmdldFJBTSxcbiAgICAgICAgICAgIHJlZ2lvbjogcmVnaW9uXG4gICAgICAgIH1cbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBhbiBvYmplY3QgdG8gc3RvcmUgdGhlIG9wdGltYWwgZGF0YSB3aXRoIGRlZmF1bHQgdmFsdWVzXG4gICAgICAgIGxldCBvcHRpbWFsQ29tYmluYXRpb246IEluc3RhbmNlRGF0YVtdID0gW107XG4gICAgICAgIGxldCBvcHRpbWFsRGF0YTogQ29tYmluYXRpb25EYXRhID0ge1xuICAgICAgICAgICAgb3B0aW1hbENvbWJpbmF0aW9uOiBvcHRpbWFsQ29tYmluYXRpb24sXG4gICAgICAgICAgICBleGNlZWRDUFVzOiBOdW1iZXIuTUFYX1ZBTFVFLFxuICAgICAgICAgICAgb3B0aW1hbFJBTTogTnVtYmVyLk1BWF9WQUxVRSxcbiAgICAgICAgICAgIGxvd2VzdENvc3Q6IE51bWJlci5NQVhfVkFMVUVcbiAgICAgICAgfVxuICAgICAgICAvLyBJbml0aWFsaXplIHZhcmlhYmxlcyBmb3IgdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIGNvbWJpbmF0aW9uIGJlaW5nIGV2YWx1YXRlZFxuICAgICAgICBsZXQgY3VycmVudERhdGE6IEN1cnJlbnREYXRhID0ge1xuICAgICAgICAgICAgY29tYmluYXRpb246IFtdLFxuICAgICAgICAgICAgY3VycmVudENQVXM6IDAsXG4gICAgICAgICAgICBjdXJyZW50UkFNOiAwLFxuICAgICAgICAgICAgY3VycmVudENvc3Q6IDBcbiAgICAgICAgfVxuICAgICAgICAvLyBTdGFydCB0aGUgcmVjdXJzaXZlIHNlYXJjaCBmb3IgdGhlIG9wdGltYWwgY29tYmluYXRpb25cbiAgICAgICAgbGV0IGluZGV4ID0gMDtcbiAgICAgICAgb3B0aW1hbERhdGEgPSBmaW5kT3B0aW1hbENvbWJpbmF0aW9uKGluZGV4LCBmYW1pbHksIG9yaWdpbmFsRGF0YSwgb3B0aW1hbERhdGEsIGN1cnJlbnREYXRhKTtcblxuICAgICAgICAvLyBJZiBhbiBvcHRpbWFsIGNvbWJpbmF0aW9uIGlzIGZvdW5kXG4gICAgICAgIG9wdGltYWxDb21iaW5hdGlvbiA9IG9wdGltYWxEYXRhLm9wdGltYWxDb21iaW5hdGlvbjtcbiAgICAgICAgaWYgKG9wdGltYWxDb21iaW5hdGlvbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgZmluYWwgdG90YWwgY29zdCBhbmQgcHJpY2UgZGlmZmVyZW5jZVxuICAgICAgICAgICAgbGV0IGZpbmFsVG90YWxDb3N0ID0gb3B0aW1hbENvbWJpbmF0aW9uLnJlZHVjZSgoc3VtLCBpbnNEYXRhKSA9PiBzdW0gKyBpbnNEYXRhLmluc3RhbmNlLmdldFByaWNlKHJlZ2lvbiksIDApO1xuICAgICAgICAgICAgbGV0IHByaWNlRGlmZmVyZW5jZSA9IG9yaWdpbmFsRGF0YS5vcmlnaW5hbENvc3QgLSBmaW5hbFRvdGFsQ29zdDsgLy8gVGhpcyB3aWxsIGJlIHBvc2l0aXZlLCBpbmRpY2F0aW5nIHNhdmluZ3NcbiAgICAgICAgICAgIGxldCBwcmljZURpZmZlcmVuY2VQZXJjZW50YWdlID0gKHByaWNlRGlmZmVyZW5jZSAvIG9yaWdpbmFsRGF0YS5vcmlnaW5hbENvc3QpICogMTAwO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYEZpbmFsIHRvdGFsIGNvc3Q6ICR7ZmluYWxUb3RhbENvc3R9LCBQcmljZSBkaWZmZXJlbmNlOiAke3ByaWNlRGlmZmVyZW5jZX0sIFByaWNlIGRpZmZlcmVuY2UgcGVyY2VudGFnZTogJHtwcmljZURpZmZlcmVuY2VQZXJjZW50YWdlfWApO1xuICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBvcHRpbWFsQ29tYmluYXRpb24gdG8gaW5jbHVkZSB0aGUgcHJpY2UgZGlmZmVyZW5jZSBwZXJjZW50YWdlXG4gICAgICAgICAgICBvcHRpbWFsQ29tYmluYXRpb24uZm9yRWFjaCgoaW5zRGF0YSkgPT4ge1xuICAgICAgICAgICAgICAgIGluc0RhdGEuY3B1VXRpbCA9IGluc0RhdGEuY3B1VXRpbCAqIHRhcmdldFV0aWw7XG4gICAgICAgICAgICAgICAgaW5zRGF0YS5wcmljZURpZmZlcmVuY2UgPSBwcmljZURpZmZlcmVuY2VQZXJjZW50YWdlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBJZiBubyBiZXR0ZXIgY29tYmluYXRpb24gZm91bmQsIHVzZSB0aGUgb3JpZ2luYWwgaW5zdGFuY2VcbiAgICAgICAgICAgIC8vb3B0aW1hbENvbWJpbmF0aW9uID0gW1tjbG91ZEluc3RhbmNlLCBjcHVVdGlsLCBvcmlnaW5hbE1lbVV0aWwsIGNsb3VkSW5zdGFuY2UuUkFNLCBjbG91ZEluc3RhbmNlLmdldFByaWNlKHJlZ2lvbiksIDBdXTtcbiAgICAgICAgICAgIG9wdGltYWxDb21iaW5hdGlvbiA9IFt7XG4gICAgICAgICAgICAgICAgaW5zdGFuY2U6IGNsb3VkSW5zdGFuY2UsXG4gICAgICAgICAgICAgICAgY3B1VXRpbDogY3B1VXRpbCxcbiAgICAgICAgICAgICAgICBtZW1VdGlsOiBvcmlnaW5hbE1lbVV0aWwsXG4gICAgICAgICAgICAgICAgcHJpY2U6IGNsb3VkSW5zdGFuY2UuZ2V0UHJpY2UocmVnaW9uKSxcbiAgICAgICAgICAgICAgICBwcmljZURpZmZlcmVuY2U6IDBcbiAgICAgICAgICAgIH1dO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9wdGltYWxDb21iaW5hdGlvbjtcbiAgICB9XG4gICAgXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSBkYXRhYmFzZXMgb2YgY2xvdWQgaW5zdGFuY2VzLlxuICAgICAqIFRoaXMgbWV0aG9kIGlzIHVzZWQgZm9yIHRlc3RpbmcgcHVycG9zZXMuXG4gICAgICogXG4gICAgICogQHJldHVybnMgVGhlIGRhdGFiYXNlcyBvZiBjbG91ZCBpbnN0YW5jZXNcbiAgICAgKi9cbiAgICBjb25zdCBnZXREYXRhYmFzZXMgPSAoKTogTWFwPHN0cmluZywgQ1BVRGF0YWJhc2U+ID0+IHtcbiAgICAgICAgcmV0dXJuIENhY2hlO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIG1ldGFkYXRhLFxuICAgICAgICBleGVjdXRlLFxuICAgICAgICBnZXREYXRhYmFzZXNcbiAgICB9O1xufSJdfQ==