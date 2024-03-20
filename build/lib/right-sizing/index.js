"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RightSizingModel = void 0;
const zod_1 = require("zod");
const crypto = __importStar(require("crypto"));
const util_1 = require("../../util/util");
const validations_1 = require("../../util/validations");
const CPUFamily_1 = require("./CPUFamily");
const path_1 = __importDefault(require("path"));
/**
 * Implementation of the ModelPluginInterface for the Right Sizing model.
 */
const RightSizingModel = (params) => {
    const metadata = {
        kind: 'execute'
    };
    let database = new CPUFamily_1.CPUDatabase();
    const Cache = new Map();
    const builtinDataPath = path_1.default.join(__dirname, '../../..', 'data');
    const cpuMetrics = ['cpu-util', 'cloud-vendor', 'cloud-instance-type'];
    console.log('path: ', builtinDataPath);
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
                        await newDatabase.loadModelData(builtinDataPath + '/aws-instances.json');
                    }
                    else if (cloudVendor === 'azure') {
                        await newDatabase.loadModelData(builtinDataPath + '/azure-instances.json');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbGliL3JpZ2h0LXNpemluZy9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDZCQUF3QjtBQUN4QiwrQ0FBaUM7QUFFakMsMENBQTJDO0FBRzNDLHdEQUFxRTtBQUdyRSwyQ0FBeUQ7QUFDekQsZ0RBQXdCO0FBRXhCOztHQUVHO0FBQ0ksTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLE1BQW9CLEVBQW1CLEVBQUU7SUFFdEUsTUFBTSxRQUFRLEdBQUc7UUFDYixJQUFJLEVBQUUsU0FBUztLQUNsQixDQUFDO0lBRUYsSUFBSSxRQUFRLEdBQWdCLElBQUksdUJBQVcsRUFBRSxDQUFDO0lBQzlDLE1BQU0sS0FBSyxHQUE2QixJQUFJLEdBQUcsRUFBRSxDQUFDO0lBQ2xELE1BQU0sZUFBZSxHQUFHLGNBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNqRSxNQUFNLFVBQVUsR0FBRyxDQUFDLFVBQVUsRUFBRSxjQUFjLEVBQUUscUJBQXFCLENBQUMsQ0FBQztJQUV2RSxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUN2Qzs7OztPQUlHO0lBQ0gsTUFBTSxTQUFTLEdBQUcsQ0FBQyxZQUEwQixFQUFFLEVBQUU7UUFDN0MsNkRBQTZEO1FBQzdELElBQUksWUFBWSxJQUFJLFdBQVcsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUM5QyxNQUFNLGdCQUFnQixHQUFHLFlBQVksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNuRCxJQUFJLE9BQU8sZ0JBQWdCLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ3ZDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUM5QyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxR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QVk7S0FDZixDQUFDO0FBQ04sQ0FBQyxDQUFBO0FBalhZLFFBQUEsZ0JBQWdCLG9CQWlYNUIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcbmltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xuXG5pbXBvcnQgeyBmaXhGbG9hdCB9IGZyb20gJy4uLy4uL3V0aWwvdXRpbCc7XG5pbXBvcnQgeyBQbHVnaW5JbnRlcmZhY2UgfSBmcm9tICcuLi8uLi9pbnRlcmZhY2VzJztcbmltcG9ydCB7IENvbmZpZ1BhcmFtcywgUGx1Z2luUGFyYW1zIH0gZnJvbSAnLi4vLi4vdHlwZXMvY29tbW9uJztcbmltcG9ydCB7IHZhbGlkYXRlLCBhdExlYXN0T25lRGVmaW5lZCB9IGZyb20gJy4uLy4uL3V0aWwvdmFsaWRhdGlvbnMnO1xuaW1wb3J0IHsgSW5zdGFuY2VEYXRhLCBDb21iaW5hdGlvbkRhdGEsIEN1cnJlbnREYXRhLCBPcmlnaW5hbERhdGEgfSBmcm9tICcuLi8uLi90eXBlcy9yaWdodC1zaXppbmcnO1xuXG5pbXBvcnQgeyBDUFVEYXRhYmFzZSwgQ2xvdWRJbnN0YW5jZSB9IGZyb20gJy4vQ1BVRmFtaWx5JztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuXG4vKipcbiAqIEltcGxlbWVudGF0aW9uIG9mIHRoZSBNb2RlbFBsdWdpbkludGVyZmFjZSBmb3IgdGhlIFJpZ2h0IFNpemluZyBtb2RlbC5cbiAqL1xuZXhwb3J0IGNvbnN0IFJpZ2h0U2l6aW5nTW9kZWwgPSAocGFyYW1zOiBDb25maWdQYXJhbXMpOiBQbHVnaW5JbnRlcmZhY2UgPT4ge1xuXG4gICAgY29uc3QgbWV0YWRhdGEgPSB7XG4gICAgICAgIGtpbmQ6ICdleGVjdXRlJ1xuICAgIH07XG5cbiAgICBsZXQgZGF0YWJhc2U6IENQVURhdGFiYXNlID0gbmV3IENQVURhdGFiYXNlKCk7XG4gICAgY29uc3QgQ2FjaGU6IE1hcDxzdHJpbmcsIENQVURhdGFiYXNlPiA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBidWlsdGluRGF0YVBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4nLCAnZGF0YScpO1xuICAgIGNvbnN0IGNwdU1ldHJpY3MgPSBbJ2NwdS11dGlsJywgJ2Nsb3VkLXZlbmRvcicsICdjbG91ZC1pbnN0YW5jZS10eXBlJ107XG5cbiAgICBjb25zb2xlLmxvZygncGF0aDogJywgYnVpbHRpbkRhdGFQYXRoKTtcbiAgICAvKipcbiAgICAgKiBDb25maWd1cmVzIHRoZSBtb2RlbCB3aXRoIHRoZSBwcm92aWRlZCBwYXJhbWV0ZXJzLlxuICAgICAqIFxuICAgICAqIEBwYXJhbSAgIGNvbmZpZ1BhcmFtcyBDb25maWd1cmF0aW9uIHBhcmFtZXRlcnMgZm9yIHRoZSBtb2RlbC5cbiAgICAgKi9cbiAgICBjb25zdCBjb25maWd1cmUgPSAoY29uZmlnUGFyYW1zOiBDb25maWdQYXJhbXMpID0+IHtcbiAgICAgICAgLy8gTG9hZCBtb2RlbCBkYXRhIGlmICdkYXRhLXBhdGgnIGlzIHByb3ZpZGVkIGluIGNvbmZpZ1BhcmFtc1xuICAgICAgICBpZiAoY29uZmlnUGFyYW1zICYmICdkYXRhLXBhdGgnIGluIGNvbmZpZ1BhcmFtcykge1xuICAgICAgICAgICAgY29uc3QgaW5zdGFuY2VEYXRhUGF0aCA9IGNvbmZpZ1BhcmFtc1snZGF0YS1wYXRoJ107XG4gICAgICAgICAgICBpZiAodHlwZW9mIGluc3RhbmNlRGF0YVBhdGggPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgZGF0YWJhc2UubG9hZE1vZGVsRGF0YV9zeW5jKGluc3RhbmNlRGF0YVBhdGgpO1xuICAgICAgICAgICAgICAgIENhY2hlLnNldCgnY3VzdG9tJywgZGF0YWJhc2UpOyAvLyBDYWNoZSB0aGUgbG9hZGVkIGRhdGFiYXNlXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOiBJbnZhbGlkIGluc3RhbmNlIGRhdGEgcGF0aCB0eXBlLicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIC8vIEV4ZWN1dGUgdGhlIGNvbmZpZ3VyZSBmdW5jdGlvblxuICAgIGNvbmZpZ3VyZShwYXJhbXMpO1xuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZXMgdGhlIG1vZGVsIHdpdGggdGhlIGdpdmVuIGlucHV0cyBhbmQgcmV0dXJucyB0aGUgY29ycmVzcG9uZGluZyBvdXRwdXRzLlxuICAgICAqIFxuICAgICAqIEBwYXJhbSAgIGlucHV0cyBUaGUgbGlzdCBvZiBpbnB1dCBwYXJhbWV0ZXJzIGZvciB0aGUgbW9kZWxzLlxuICAgICAqIEByZXR1cm4gIEEgUHJvbWlzZSByZXNvbHZpbmcgdG8gYW4gYXJyYXkgb2YgbW9kZWwgcGFyYW1ldGVycyByZXByZXNlbnRpbmcgdGhlIG91dHB1dHMuXG4gICAgICovXG4gICAgY29uc3QgZXhlY3V0ZSA9IGFzeW5jIChpbnB1dHM6IFBsdWdpblBhcmFtc1tdKSA9PiB7XG4gICAgICAgIGxldCBvdXRwdXRzOiBQbHVnaW5QYXJhbXNbXSA9IFtdO1xuXG4gICAgICAgIC8vIFByb2Nlc3MgZWFjaCBpbnB1dFxuICAgICAgICBmb3IgKGNvbnN0IGlucHV0IG9mIGlucHV0cykge1xuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgJ2Nsb3VkLXZlbmRvcicga2V5IGV4aXN0cyBpbiBpbnB1dFxuICAgICAgICAgICAgaWYgKCdjbG91ZC12ZW5kb3InIGluIGlucHV0KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY2xvdWRWZW5kb3IgPSBpbnB1dFsnY2xvdWQtdmVuZG9yJ107XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgZGF0YWJhc2UgZm9yIHRoZSBjbG91ZCB2ZW5kb3IgaXMgY2FjaGVkXG4gICAgICAgICAgICAgICAgaWYgKCFDYWNoZS5oYXMoY2xvdWRWZW5kb3IpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElmIG5vdCBjYWNoZWQsIGNyZWF0ZSBhIG5ldyBkYXRhYmFzZSBpbnN0YW5jZSBhbmQgbG9hZCBtb2RlbCBkYXRhIGZvciB0aGUgc3BlY2lmaWMgY2xvdWQgdmVuZG9yXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5ld0RhdGFiYXNlID0gbmV3IENQVURhdGFiYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjbG91ZFZlbmRvciA9PT0gJ2F3cycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ld0RhdGFiYXNlLmxvYWRNb2RlbERhdGEoYnVpbHRpbkRhdGFQYXRoICsgJy9hd3MtaW5zdGFuY2VzLmpzb24nKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjbG91ZFZlbmRvciA9PT0gJ2F6dXJlJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbmV3RGF0YWJhc2UubG9hZE1vZGVsRGF0YShidWlsdGluRGF0YVBhdGggKyAnL2F6dXJlLWluc3RhbmNlcy5qc29uJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgQ2FjaGUuc2V0KGNsb3VkVmVuZG9yLCBuZXdEYXRhYmFzZSk7IC8vIENhY2hlIHRoZSBsb2FkZWQgZGF0YWJhc2VcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGF0YWJhc2UgPSBDYWNoZS5nZXQoY2xvdWRWZW5kb3IpITsgLy8gU2V0IGRhdGFiYXNlIHRvIHRoZSBjYWNoZWQgb25lXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFByb2Nlc3MgaW5wdXQgYW5kIGNvbGxlY3QgcHJvY2Vzc2VkIG91dHB1dHNcbiAgICAgICAgICAgIGxldCBwcm9jZXNzZWRPdXRwdXRzID0gcHJvY2Vzc0lucHV0KGlucHV0KTtcbiAgICAgICAgICAgIG91dHB1dHMucHVzaCguLi5wcm9jZXNzZWRPdXRwdXRzKTsgLy8gQXBwZW5kIHByb2Nlc3NlZCBvdXRwdXRzIHRvIHRoZSBvdXRwdXRzIGFycmF5XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG91dHB1dHMpOyAvLyBSZXNvbHZlIHRoZSBwcm9taXNlIHdpdGggdGhlIG91dHB1dHMgYXJyYXlcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQcm9jZXNzZXMgYSBzaW5nbGUgaW5wdXQgdG8gZ2VuZXJhdGUgbXVsdGlwbGUgb3V0cHV0cywgZWFjaCByZXByZXNlbnRpbmcgYSBkaWZmZXJlbnQgaW5zdGFuY2UgY29tYmluYXRpb24uXG4gICAgICogQHBhcmFtIGlucHV0IFRoZSBpbnB1dCBwYXJhbWV0ZXJzIGZvciB0aGUgbW9kZWwuXG4gICAgICogQHJldHVybnMgQW4gYXJyYXkgb2YgbW9kZWwgcGFyYW1ldGVycyByZXByZXNlbnRpbmcgZGlmZmVyZW50IGluc3RhbmNlIGNvbWJpbmF0aW9ucy5cbiAgICAgKi9cbiAgICBjb25zdCBwcm9jZXNzSW5wdXQgPSAoaW5wdXQ6IFBsdWdpblBhcmFtcyk6IFBsdWdpblBhcmFtc1tdID0+IHtcbiAgICAgICAgbGV0IG91dHB1dHM6IFBsdWdpblBhcmFtc1tdID0gW107XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgaW5wdXQgYW5kIHByb2NlZWQgaWYgdmFsaWRcbiAgICAgICAgaWYgKHZhbGlkYXRlU2luZ2xlSW5wdXQoaW5wdXQpKSB7XG4gICAgICAgICAgICAvLyBTdG9yZSBvcmlnaW5hbCBpbnN0YW5jZSBkZXRhaWxzXG4gICAgICAgICAgICBpbnB1dFsnb2xkLWluc3RhbmNlJ10gPSBpbnB1dFsnY2xvdWQtaW5zdGFuY2UtdHlwZSddO1xuICAgICAgICAgICAgaW5wdXRbJ29sZC1jcHUtdXRpbCddID0gaW5wdXRbJ2NwdS11dGlsJ107XG4gICAgICAgICAgICBpbnB1dFsnb2xkLW1lbS11dGlsJ10gPSBpbnB1dFsnbWVtLXV0aWwnXTtcblxuICAgICAgICAgICAgLy8gUmV0cmlldmUgaW5zdGFuY2UgZGV0YWlscyBmcm9tIGRhdGFiYXNlXG4gICAgICAgICAgICBsZXQgaW5zdGFuY2UgPSBkYXRhYmFzZS5nZXRJbnN0YW5jZUJ5TW9kZWwoaW5wdXRbJ2Nsb3VkLWluc3RhbmNlLXR5cGUnXSk7XG4gICAgICAgICAgICBpZiAoIWluc3RhbmNlKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGNsb3VkIGluc3RhbmNlOiAke2lucHV0WydjbG91ZC1pbnN0YW5jZS10eXBlJ119LCBub3QgZm91bmQgaW4gY2xvdWQgdmVuZG9yIGRhdGFiYXNlOiAke2lucHV0WydjbG91ZC12ZW5kb3InXX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxldCB1dGlsOiBudW1iZXI7XG4gICAgICAgICAgICBsZXQgdGFyZ2V0VXRpbDogbnVtYmVyO1xuICAgICAgICAgICAgbGV0IHJlczogSW5zdGFuY2VEYXRhW107XG4gICAgICAgICAgICBsZXQgb3JpZ2luYWxNZW1VdGlsID0gaW5wdXRbJ21lbS11dGlsJ107XG4gICAgICAgICAgICBsZXQgdGFyZ2V0UkFNID0gKG9yaWdpbmFsTWVtVXRpbCAvIDEwMCkgKiBpbnN0YW5jZS5SQU07XG4gICAgICAgICAgICBsZXQgcmVnaW9uID0gaW5wdXRbJ2xvY2F0aW9uJ107XG5cbiAgICAgICAgICAgIGxldCBjcHVVdGlsID0gaW5wdXRbJ2NwdS11dGlsJ107XG4gICAgICAgICAgICAvLyBFbnN1cmUgY3B1LXV0aWwgaXMgYSBudW1iZXJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY3B1VXRpbCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICB1dGlsID0gY3B1VXRpbCBhcyBudW1iZXI7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjcHVVdGlsID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHV0aWwgPSBwYXJzZUZsb2F0KGNwdVV0aWwpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NwdS11dGlsIG11c3QgYmUgYSBudW1iZXIgb3Igc3RyaW5nJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB1dGlsID0gdXRpbCAvIDEwMDsgLy8gQ29udmVydCBwZXJjZW50YWdlIHRvIGRlY2ltYWxcblxuICAgICAgICAgICAgLy8gU2V0IHRhcmdldCBDUFUgdXRpbGl6YXRpb24gdG8gMTAwIGlmIG5vdCBkZWZpbmVkXG4gICAgICAgICAgICBpZiAodHlwZW9mIGlucHV0Wyd0YXJnZXQtY3B1LXV0aWwnXSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXRVdGlsID0gMTAwO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBFbnN1cmUgdGFyZ2V0LWNwdS11dGlsIGlzIGEgbnVtYmVyIG9yIHN0cmluZ1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaW5wdXRbJ3RhcmdldC1jcHUtdXRpbCddID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRVdGlsID0gaW5wdXRbJ3RhcmdldC1jcHUtdXRpbCddIGFzIG51bWJlcjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dFsndGFyZ2V0LWNwdS11dGlsJ10gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFV0aWwgPSBwYXJzZUZsb2F0KGlucHV0Wyd0YXJnZXQtY3B1LXV0aWwnXSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd0YXJnZXQtY3B1LXV0aWwgbXVzdCBiZSBhIG51bWJlciBvciBzdHJpbmcnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0YXJnZXRVdGlsID0gdGFyZ2V0VXRpbCAvIDEwMDsgLy8gQ29udmVydCBwZXJjZW50YWdlIHRvIGRlY2ltYWxcblxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIHJpZ2h0IHNpemluZyBmb3IgdGhlIGluc3RhbmNlXG4gICAgICAgICAgICByZXMgPSBjYWxjdWxhdGVSaWdodFNpemluZyhpbnN0YW5jZSwgdXRpbCwgdGFyZ2V0VXRpbCwgdGFyZ2V0UkFNLCBvcmlnaW5hbE1lbVV0aWwsIHJlZ2lvbik7XG5cbiAgICAgICAgICAgIC8vIGdlbmVyYXRlIHVuaXF1ZSBpZCB0byB1c2UgZm9yIGNhc2VzIHdoZXJlIG1hbnkgaW5zdGFuY2VzIHJlcGxhY2Ugb25lXG4gICAgICAgICAgICBsZXQgb3V0cHV0X2lkID0gY3J5cHRvLnJhbmRvbVVVSUQoKTtcblxuICAgICAgICAgICAgLy8gQ3JlYXRlIGEgbmV3IG91dHB1dCBmb3IgZWFjaCBpbnN0YW5jZSBjb21iaW5hdGlvblxuICAgICAgICAgICAgcmVzLmZvckVhY2goKGNvbWJpbmF0aW9uKSA9PiB7XG4gICAgICAgICAgICAgICAgbGV0IG91dHB1dCA9IHsgLi4uaW5wdXQgfTsgLy8gQ29weSBpbnB1dCB0byBjcmVhdGUgbmV3IG91dHB1dFxuICAgICAgICAgICAgICAgIGxldCBwcm9jZXNzZWRNb2RlbCA9IGNvbWJpbmF0aW9uLmluc3RhbmNlLm1vZGVsO1xuXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIG91dHB1dCBwYXJhbWV0ZXJzXG4gICAgICAgICAgICAgICAgb3V0cHV0WydjbG91ZC1pbnN0YW5jZS10eXBlJ10gPSBwcm9jZXNzZWRNb2RlbDtcbiAgICAgICAgICAgICAgICBvdXRwdXRbJ2NwdS11dGlsJ10gPSBmaXhGbG9hdChjb21iaW5hdGlvbi5jcHVVdGlsICogMTAwLCAyKTtcbiAgICAgICAgICAgICAgICBvdXRwdXRbJ21lbS11dGlsJ10gPSBmaXhGbG9hdChjb21iaW5hdGlvbi5tZW1VdGlsICogMTAwLCAyKTtcbiAgICAgICAgICAgICAgICBvdXRwdXRbJ3RvdGFsLW1lbW9yeUdCJ10gPSBjb21iaW5hdGlvbi5pbnN0YW5jZS5SQU07XG4gICAgICAgICAgICAgICAgaWYgKHJlcy5sZW5ndGggPiAxKSB7XG4gICAgICAgICAgICAgICAgICAgIG91dHB1dFsnb3V0cHV0LWlkJ10gPSBvdXRwdXRfaWRcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBEZXRlcm1pbmUgcHJpY2UgY2hhbmdlXG4gICAgICAgICAgICAgICAgaWYgKGNvbWJpbmF0aW9uLnByaWNlRGlmZmVyZW5jZSA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0WydwcmljZS1jaGFuZ2UnXSA9IGBQcmljZSBkZWNyZWFzZWQgYnkgJHtNYXRoLmNlaWwoY29tYmluYXRpb24ucHJpY2VEaWZmZXJlbmNlKX0lYDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBvdXRwdXRbJ3ByaWNlLWNoYW5nZSddID0gYFByaWNlIGhhcyBpbmNyZWFzZWQgYnkgJHtNYXRoLmNlaWwoTWF0aC5hYnMoY29tYmluYXRpb24ucHJpY2VEaWZmZXJlbmNlKSl9JWA7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gU2V0IHJlY29tbWVuZGF0aW9uIGJhc2VkIG9uIHByb2Nlc3NlZCBtb2RlbFxuICAgICAgICAgICAgICAgIGlmIChwcm9jZXNzZWRNb2RlbCA9PT0gaW5wdXRbJ29sZC1pbnN0YW5jZSddKSB7XG4gICAgICAgICAgICAgICAgICAgIG91dHB1dFsnUmVjb21tZW5kYXRpb24nXSA9IFwiU2l6ZSBhbHJlYWR5IG9wdGltYWxcIjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBvdXRwdXRzLnB1c2gob3V0cHV0KTsgLy8gQWRkIG91dHB1dCB0byBvdXRwdXRzIGFycmF5XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG91dHB1dHMucHVzaChpbnB1dCk7IC8vIFB1c2ggaW5wdXQgdW5jaGFuZ2VkIGlmIG5vdCBwcm9jZXNzaW5nXG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3V0cHV0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBWYWxpZGF0ZSB0aGUgaW5wdXQgcGFyYW1ldGVycyBvYmplY3QsIGNoZWNrIGlmIHRoZSBuZWNlc3NhcnkgcGFyYW1ldGVycyBhcmUgcHJlc2VudC5cbiAgICAgKiBcbiAgICAgKiBAcGFyYW0gaW5wdXQgSW5wdXQgbW9kZWwgcGFyYW1ldGVycyBvYmplY3QgdG8gYmUgdmFsaWRhdGVkXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgaW5wdXQgaXMgdmFsaWQsIGZhbHNlIG90aGVyd2lzZVxuICAgICAqL1xuICAgIGNvbnN0IHZhbGlkYXRlU2luZ2xlSW5wdXQgPSAoaW5wdXQ6IFBsdWdpblBhcmFtcykgPT4ge1xuICAgICAgICBjb25zdCBzY2hlbWEgPSB6XG4gICAgICAgIC5vYmplY3Qoe1xuICAgICAgICAgICAgJ2Nsb3VkLWluc3RhbmNlLXR5cGUnOiB6LnN0cmluZygpLFxuICAgICAgICAgICAgJ2Nsb3VkLXZlbmRvcic6IHouc3RyaW5nKCksXG4gICAgICAgICAgICAnY3B1LXV0aWwnOiB6Lm51bWJlcigpLmd0ZSgwKS5sdGUoMTAwKS5vcih6LnN0cmluZygpLnJlZ2V4KC9eWzAtOV0rKFxcLlswLTldKyk/JC8pKSxcbiAgICAgICAgICAgICd0YXJnZXQtY3B1LXV0aWwnOiB6Lm51bWJlcigpLmd0ZSgwKS5sdGUoMTAwKS5vcih6LnN0cmluZygpLnJlZ2V4KC9eWzAtOV0rKFxcLlswLTldKyk/JC8pKS5vcHRpb25hbCgpXG4gICAgICAgIH0pXG4gICAgICAgIC5yZWZpbmUoYXRMZWFzdE9uZURlZmluZWQsIHtcbiAgICAgICAgICAgIG1lc3NhZ2U6IGBBdCBsZWFzdCBvbmUgb2YgJHtjcHVNZXRyaWNzfSBzaG91bGQgcHJlc2VudC5gLFxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gdmFsaWRhdGU8ei5pbmZlcjx0eXBlb2Ygc2NoZW1hPj4oc2NoZW1hLCBpbnB1dCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUHJvY2Vzc2VzIGEgc2luZ2xlIGlucHV0IHRvIGdlbmVyYXRlIG11bHRpcGxlIG91dHB1dHMsIGVhY2ggcmVwcmVzZW50aW5nIGEgZGlmZmVyZW50IGluc3RhbmNlIGNvbWJpbmF0aW9uLlxuICAgICAqIEBwYXJhbSBpbmRleCBUaGUgY3VycmVudCBpbmRleCBpbiB0aGUgZmFtaWx5IGFycmF5LlxuICAgICAqIEBwYXJhbSBmYW1pbHkgVGhlIHNvcnRlZCBhcnJheSBvZiBDbG91ZEluc3RhbmNlIG9iamVjdHMuXG4gICAgICogQHBhcmFtIG9yaWdpbmFsRGF0YSBXaXRoIG9yaWdpbmFsIGNvc3QsIFJBTSBzaXplLCByZXF1aXJlZCB2Q1BVcywgdGFyZ2V0IGNwdSB1dGlsLCB0YXJnZXQgUkFNLCByZWdpb24gb2YgdGhlIGluc3RhbmNlLlxuICAgICAqIEBwYXJhbSBvcHRpbWFsRGF0YSBUaGUgY3VycmVudCBvcHRpbWFsIGNvbWJpbmF0aW9uIGRhdGEuXG4gICAgICogQHBhcmFtIGN1cnJlbnREYXRhIFRoZSBjdXJyZW50IHN0YXRlIG9mIHRoZSBjb21iaW5hdGlvbiBiZWluZyBldmFsdWF0ZWQuXG4gICAgICogQHJldHVybnMgQW4gb2JqZWN0IGNvbnRhaW5pbmcgb3B0aW1hbCBjb21iaW5hdGlvbiBkZXRhaWxzLCBjbG9zZXN0IENQVSB1dGlsaXphdGlvbiBkaWZmZXJlbmNlLCBvcHRpbWFsIFJBTSwgYW5kIGxvd2VzdCBjb3N0LlxuICAgICAqL1xuICAgIGNvbnN0IGZpbmRPcHRpbWFsQ29tYmluYXRpb24gPSAoaW5kZXg6IG51bWJlciwgZmFtaWx5OiBDbG91ZEluc3RhbmNlW10sIFxuICAgICAgICBvcmlnaW5hbERhdGE6IE9yaWdpbmFsRGF0YSwgb3B0aW1hbERhdGE6IENvbWJpbmF0aW9uRGF0YSwgY3VycmVudERhdGE6IEN1cnJlbnREYXRhKTogQ29tYmluYXRpb25EYXRhID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgaW5kZXggZXhjZWVkcyB0aGUgbGVuZ3RoIG9mIHRoZSBmYW1pbHkgYXJyYXksIHJldHVybiB0aGUgY3VycmVudCBvcHRpbWFsIGRhdGFcbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPj0gZmFtaWx5Lmxlbmd0aCkgcmV0dXJuIHsgLi4ub3B0aW1hbERhdGEgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGluc3RhbmNlID0gZmFtaWx5W2luZGV4XTtcbiAgICBcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBhZGRpbmcgdGhlIGN1cnJlbnQgaW5zdGFuY2Ugd291bGQgZXhjZWVkIHRoZSBSQU0gb2Ygb3JpZ2luYWwgaW5zdGFuY2VcbiAgICAgICAgICAgICAgICAvLyBJZiBpdCBleGNlZWRzLCB0cnkgdGhlIG5leHQgb25lIChmYW1pbHkgaGFzIGJlZW4gc29ydGVkIGluIGRlc2NlbmRpbmcgb3JkZXIpLlxuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50RGF0YS5jdXJyZW50UkFNICsgaW5zdGFuY2UuUkFNID4gb3JpZ2luYWxEYXRhLm9yaWdpbmFsUkFNKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmaW5kT3B0aW1hbENvbWJpbmF0aW9uKGluZGV4ICsgMSwgZmFtaWx5LCBvcmlnaW5hbERhdGEsIG9wdGltYWxEYXRhLCBjdXJyZW50RGF0YSk7XG4gICAgICAgICAgICAgICAgfVxuICAgIFxuICAgICAgICAgICAgICAgIGN1cnJlbnREYXRhLmN1cnJlbnRDUFVzICs9IGluc3RhbmNlLnZDUFVzO1xuICAgICAgICAgICAgICAgIGN1cnJlbnREYXRhLmN1cnJlbnRSQU0gKz0gaW5zdGFuY2UuUkFNO1xuICAgICAgICAgICAgICAgIGN1cnJlbnREYXRhLmN1cnJlbnRDb3N0ICs9IGluc3RhbmNlLmdldFByaWNlKG9yaWdpbmFsRGF0YS5yZWdpb24pO1xuICAgICAgICAgICAgICAgIGN1cnJlbnREYXRhLmNvbWJpbmF0aW9uLnB1c2goaW5zdGFuY2UpO1xuICAgIFxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBjdXJyZW50IGNvbWJpbmF0aW9uIG1lZXRzIHRoZSB0YXJnZXQgcmVxdWlyZW1lbnRzXG4gICAgICAgICAgICAgICAgaWYgKGN1cnJlbnREYXRhLmN1cnJlbnRSQU0gPj0gb3JpZ2luYWxEYXRhLnRhcmdldFJBTSAmJiBjdXJyZW50RGF0YS5jdXJyZW50Q1BVcyA+PSBvcmlnaW5hbERhdGEucmVxdWlyZWR2Q1BVcykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50RXhjZWVkZWRDUFVzID0gZml4RmxvYXQoY3VycmVudERhdGEuY3VycmVudENQVXMgLSBvcmlnaW5hbERhdGEucmVxdWlyZWR2Q1BVcywgNSlcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudFJBTSA9IGZpeEZsb2F0KGN1cnJlbnREYXRhLmN1cnJlbnRSQU0sIDUpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50Q29zdCA9IGZpeEZsb2F0KGN1cnJlbnREYXRhLmN1cnJlbnRDb3N0LCA1KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY3VycmVudExlbmd0aCA9IGN1cnJlbnREYXRhLmNvbWJpbmF0aW9uLmxlbmd0aDtcbiAgICBcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgb3B0aW1hbEV4Y2VlZENQVSA9IGZpeEZsb2F0KG9wdGltYWxEYXRhLmV4Y2VlZENQVXMsIDUpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBvcHRpbWFsUkFNID0gZml4RmxvYXQob3B0aW1hbERhdGEub3B0aW1hbFJBTSwgNSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxvd2VzdENvc3QgPSBmaXhGbG9hdChvcHRpbWFsRGF0YS5sb3dlc3RDb3N0LCA1KTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3Qgb3B0aW1hbExlbmd0aCA9IG9wdGltYWxEYXRhLm9wdGltYWxDb21iaW5hdGlvbi5sZW5ndGg7XG4gICAgXG4gICAgICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBvcHRpbWFsIGNvbWJpbmF0aW9uIGlmIHRoZSBjdXJyZW50IGNvbWJpbmF0aW9uIGlzIGJldHRlclxuICAgICAgICAgICAgICAgICAgICBpZiAoY3VycmVudEV4Y2VlZGVkQ1BVcyA8IG9wdGltYWxFeGNlZWRDUFUgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIChjdXJyZW50RXhjZWVkZWRDUFVzID09PSBvcHRpbWFsRXhjZWVkQ1BVICYmIGN1cnJlbnRSQU0gPCBvcHRpbWFsUkFNKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgKGN1cnJlbnRFeGNlZWRlZENQVXMgPT09IG9wdGltYWxFeGNlZWRDUFUgJiYgY3VycmVudFJBTSA9PT0gb3B0aW1hbFJBTSAmJiBjdXJyZW50RGF0YS5jdXJyZW50Q29zdCA8IGxvd2VzdENvc3QpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAoY3VycmVudEV4Y2VlZGVkQ1BVcyA9PT0gb3B0aW1hbEV4Y2VlZENQVSAmJiBjdXJyZW50UkFNID09PSBvcHRpbWFsUkFNICYmIGN1cnJlbnRDb3N0ID09PSBsb3dlc3RDb3N0ICYmIGN1cnJlbnRMZW5ndGggPCBvcHRpbWFsTGVuZ3RoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW1hbERhdGEuZXhjZWVkQ1BVcyA9IGN1cnJlbnRFeGNlZWRlZENQVXM7XG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpbWFsRGF0YS5vcHRpbWFsUkFNID0gY3VycmVudFJBTTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGltYWxEYXRhLmxvd2VzdENvc3QgPSBjdXJyZW50Q29zdDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0b3RhbENQVVV0aWwgPSAob3JpZ2luYWxEYXRhLnJlcXVpcmVkdkNQVXMgLyBjdXJyZW50RGF0YS5jdXJyZW50Q1BVcyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdG90YWxNZW1VdGlsID0gKG9yaWdpbmFsRGF0YS50YXJnZXRSQU0gLyBjdXJyZW50RGF0YS5jdXJyZW50UkFNKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBvcHRpbWFsIGNvbWJpbmF0aW9uIGFycmF5XG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpbWFsRGF0YS5vcHRpbWFsQ29tYmluYXRpb24gPSBjdXJyZW50RGF0YS5jb21iaW5hdGlvbi5tYXAoKGluc3RhbmNlOiBDbG91ZEluc3RhbmNlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zdGFuY2U6IGluc3RhbmNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjcHVVdGlsOiB0b3RhbENQVVV0aWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1lbVV0aWw6IHRvdGFsTWVtVXRpbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJpY2U6IGluc3RhbmNlLmdldFByaWNlKG9yaWdpbmFsRGF0YS5yZWdpb24pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmljZURpZmZlcmVuY2U6IDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICBcbiAgICAgICAgICAgICAgICAvLyBJbmNsdWRlIHRoZSBpbnN0YW5jZSBhbmQgcmVjdXJzZVxuICAgICAgICAgICAgICAgIG9wdGltYWxEYXRhID0gZmluZE9wdGltYWxDb21iaW5hdGlvbihpbmRleCwgZmFtaWx5LCBvcmlnaW5hbERhdGEsIG9wdGltYWxEYXRhLCBjdXJyZW50RGF0YSk7XG4gICAgXG4gICAgICAgICAgICAgICAgLy8gQmFja3RyYWNrOiBFeGNsdWRlIHRoZSBjdXJyZW50IGluc3RhbmNlIGFuZCByZWN1cnNlXG4gICAgICAgICAgICAgICAgY3VycmVudERhdGEuY3VycmVudENQVXMgLT0gaW5zdGFuY2UudkNQVXM7XG4gICAgICAgICAgICAgICAgY3VycmVudERhdGEuY3VycmVudFJBTSAtPSBpbnN0YW5jZS5SQU07XG4gICAgICAgICAgICAgICAgY3VycmVudERhdGEuY3VycmVudENvc3QgLT0gaW5zdGFuY2UuZ2V0UHJpY2Uob3JpZ2luYWxEYXRhLnJlZ2lvbik7XG4gICAgICAgICAgICAgICAgY3VycmVudERhdGEuY29tYmluYXRpb24ucG9wKCk7XG4gICAgXG4gICAgICAgICAgICAgICAgLy8gRXhjbHVkZSB0aGUgaW5zdGFuY2UgYW5kIHJlY3Vyc2VcbiAgICAgICAgICAgICAgICBvcHRpbWFsRGF0YSA9IGZpbmRPcHRpbWFsQ29tYmluYXRpb24oaW5kZXggKyAxLCBmYW1pbHksIG9yaWdpbmFsRGF0YSwgb3B0aW1hbERhdGEsIGN1cnJlbnREYXRhKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgICAgIHRocm93IChlcnIpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBSZXR1cm4gdGhlIGZpbmFsIG9wdGltYWwgY29tYmluYXRpb24gZGV0YWlsc1xuICAgICAgICAgICAgcmV0dXJuIHsgLi4ub3B0aW1hbERhdGEgfTtcbiAgICAgICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIGNsb3VkSW5zdGFuY2UgVGhlIG9yaWdpbmFsIGNsb3VkIGluc3RhbmNlIHRvIGJlIGFuYWx5emVkLlxuICAgICAqIEBwYXJhbSBjcHVVdGlsIFRoZSBjdXJyZW50IENQVSB1dGlsaXphdGlvbiBwZXJjZW50YWdlLlxuICAgICAqIEBwYXJhbSB0YXJnZXRVdGlsIFRoZSB0YXJnZXQgQ1BVIHV0aWxpemF0aW9uIHBlcmNlbnRhZ2UuXG4gICAgICogQHBhcmFtIHRhcmdldFJBTSBUaGUgdGFyZ2V0IFJBTSBzaXplIGluIEdCLlxuICAgICAqIEBwYXJhbSBvcmlnaW5hbE1lbVV0aWwgVGhlIG9yaWdpbmFsIG1lbW9yeSB1dGlsaXphdGlvbiBwZXJjZW50YWdlLlxuICAgICAqIEBwYXJhbSByZWdpb24gVGhlIHJlZ2lvbiB3aGVyZSB0aGUgY2xvdWQgaW5zdGFuY2UgcmVzaWRlcy5cbiAgICAgKiBAcmV0dXJucyBBbiBhcnJheSBjb250YWluaW5nIHRoZSBvcHRpbWFsIGNvbWJpbmF0aW9uIG9mIGNsb3VkIGluc3RhbmNlcyBhbG9uZyB3aXRoXG4gICAgICogICAgICAgICAgdGhlaXIgQ1BVIHV0aWxpemF0aW9uLCBtZW1vcnkgdXRpbGl6YXRpb24sIFJBTSBzaXplLCBwcmljZSwgYW5kIHByaWNlIGRpZmZlcmVuY2UgcGVyY2VudGFnZS5cbiAgICAgKi9cbiAgICBjb25zdCBjYWxjdWxhdGVSaWdodFNpemluZyA9IChjbG91ZEluc3RhbmNlOiBDbG91ZEluc3RhbmNlLCBjcHVVdGlsOiBudW1iZXIsIHRhcmdldFV0aWw6IG51bWJlciwgXG4gICAgICAgIHRhcmdldFJBTTogbnVtYmVyLCBvcmlnaW5hbE1lbVV0aWw6IG51bWJlciwgcmVnaW9uOiBzdHJpbmcpOiBJbnN0YW5jZURhdGFbXSA9PiB7XG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBjbG91ZCBpbnN0YW5jZSBpcyB2YWxpZFxuICAgICAgICBpZiAoIWNsb3VkSW5zdGFuY2UpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBjbG91ZCBpbnN0YW5jZTogJHtjbG91ZEluc3RhbmNlfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmV0cmlldmUgdGhlIG1vZGVsIGZhbWlseSBvZiB0aGUgY2xvdWQgaW5zdGFuY2VcbiAgICAgICAgbGV0IGZhbWlseSA9IGRhdGFiYXNlLmdldE1vZGVsRmFtaWx5KGNsb3VkSW5zdGFuY2UubW9kZWwpO1xuICAgICAgICAvLyBJZiBubyBtb2RlbCBmYW1pbHkgaXMgZm91bmQsIHJldHVybiB0aGUgb3JpZ2luYWwgaW5zdGFuY2VcbiAgICAgICAgaWYgKCFmYW1pbHkgfHwgZmFtaWx5Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIFt7XG4gICAgICAgICAgICAgICAgaW5zdGFuY2U6IGNsb3VkSW5zdGFuY2UsXG4gICAgICAgICAgICAgICAgY3B1VXRpbDogY3B1VXRpbCxcbiAgICAgICAgICAgICAgICBtZW1VdGlsOiBvcmlnaW5hbE1lbVV0aWwsXG4gICAgICAgICAgICAgICAgcHJpY2U6IGNsb3VkSW5zdGFuY2UuZ2V0UHJpY2UocmVnaW9uKSxcbiAgICAgICAgICAgICAgICBwcmljZURpZmZlcmVuY2U6IDBcbiAgICAgICAgICAgIH1dO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU29ydCBmYW1pbHkgaW4gZGVzY2VuZGluZyBvcmRlciBiYXNlZCBvbiBSQU0gc2l6ZVxuICAgICAgICBmYW1pbHkuc29ydCgoYSwgYikgPT4gYi5SQU0gLSBhLlJBTSk7XG5cbiAgICAgICAgLy8gUHJlcGFyZSBwYXJhbWV0ZXJzIGZvciByZWN1cnNpdmUgZmluZE9wdGltYWxDb21iaW5hdGlvbi5cbiAgICAgICAgLy8gb3JpZ2luYWwgY29zdCwgUkFNIHNpemUsIHJlcXVpcmVkIHZDUFVzLCB0YXJnZXQgY3B1IHV0aWwsIHRhcmdldCBSQU0sIHJlZ2lvbiBvZiB0aGUgaW5zdGFuY2VcbiAgICAgICAgbGV0IG9yaWdpbmFsRGF0YTogT3JpZ2luYWxEYXRhID0ge1xuICAgICAgICAgICAgb3JpZ2luYWxDb3N0OiBjbG91ZEluc3RhbmNlLmdldFByaWNlKHJlZ2lvbiksXG4gICAgICAgICAgICBvcmlnaW5hbFJBTTogY2xvdWRJbnN0YW5jZS5SQU0sXG4gICAgICAgICAgICByZXF1aXJlZHZDUFVzOiBjcHVVdGlsICogY2xvdWRJbnN0YW5jZS52Q1BVcyAvIHRhcmdldFV0aWwsXG4gICAgICAgICAgICB0YXJnZXRVdGlsOiB0YXJnZXRVdGlsLFxuICAgICAgICAgICAgdGFyZ2V0UkFNOiB0YXJnZXRSQU0sXG4gICAgICAgICAgICByZWdpb246IHJlZ2lvblxuICAgICAgICB9XG4gICAgICAgIC8vIEluaXRpYWxpemUgYW4gb2JqZWN0IHRvIHN0b3JlIHRoZSBvcHRpbWFsIGRhdGEgd2l0aCBkZWZhdWx0IHZhbHVlc1xuICAgICAgICBsZXQgb3B0aW1hbENvbWJpbmF0aW9uOiBJbnN0YW5jZURhdGFbXSA9IFtdO1xuICAgICAgICBsZXQgb3B0aW1hbERhdGE6IENvbWJpbmF0aW9uRGF0YSA9IHtcbiAgICAgICAgICAgIG9wdGltYWxDb21iaW5hdGlvbjogb3B0aW1hbENvbWJpbmF0aW9uLFxuICAgICAgICAgICAgZXhjZWVkQ1BVczogTnVtYmVyLk1BWF9WQUxVRSxcbiAgICAgICAgICAgIG9wdGltYWxSQU06IE51bWJlci5NQVhfVkFMVUUsXG4gICAgICAgICAgICBsb3dlc3RDb3N0OiBOdW1iZXIuTUFYX1ZBTFVFXG4gICAgICAgIH1cbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB2YXJpYWJsZXMgZm9yIHRoZSBjdXJyZW50IHN0YXRlIG9mIHRoZSBjb21iaW5hdGlvbiBiZWluZyBldmFsdWF0ZWRcbiAgICAgICAgbGV0IGN1cnJlbnREYXRhOiBDdXJyZW50RGF0YSA9IHtcbiAgICAgICAgICAgIGNvbWJpbmF0aW9uOiBbXSxcbiAgICAgICAgICAgIGN1cnJlbnRDUFVzOiAwLFxuICAgICAgICAgICAgY3VycmVudFJBTTogMCxcbiAgICAgICAgICAgIGN1cnJlbnRDb3N0OiAwXG4gICAgICAgIH1cbiAgICAgICAgLy8gU3RhcnQgdGhlIHJlY3Vyc2l2ZSBzZWFyY2ggZm9yIHRoZSBvcHRpbWFsIGNvbWJpbmF0aW9uXG4gICAgICAgIGxldCBpbmRleCA9IDA7XG4gICAgICAgIG9wdGltYWxEYXRhID0gZmluZE9wdGltYWxDb21iaW5hdGlvbihpbmRleCwgZmFtaWx5LCBvcmlnaW5hbERhdGEsIG9wdGltYWxEYXRhLCBjdXJyZW50RGF0YSk7XG5cbiAgICAgICAgLy8gSWYgYW4gb3B0aW1hbCBjb21iaW5hdGlvbiBpcyBmb3VuZFxuICAgICAgICBvcHRpbWFsQ29tYmluYXRpb24gPSBvcHRpbWFsRGF0YS5vcHRpbWFsQ29tYmluYXRpb247XG4gICAgICAgIGlmIChvcHRpbWFsQ29tYmluYXRpb24ubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGZpbmFsIHRvdGFsIGNvc3QgYW5kIHByaWNlIGRpZmZlcmVuY2VcbiAgICAgICAgICAgIGxldCBmaW5hbFRvdGFsQ29zdCA9IG9wdGltYWxDb21iaW5hdGlvbi5yZWR1Y2UoKHN1bSwgaW5zRGF0YSkgPT4gc3VtICsgaW5zRGF0YS5pbnN0YW5jZS5nZXRQcmljZShyZWdpb24pLCAwKTtcbiAgICAgICAgICAgIGxldCBwcmljZURpZmZlcmVuY2UgPSBvcmlnaW5hbERhdGEub3JpZ2luYWxDb3N0IC0gZmluYWxUb3RhbENvc3Q7IC8vIFRoaXMgd2lsbCBiZSBwb3NpdGl2ZSwgaW5kaWNhdGluZyBzYXZpbmdzXG4gICAgICAgICAgICBsZXQgcHJpY2VEaWZmZXJlbmNlUGVyY2VudGFnZSA9IChwcmljZURpZmZlcmVuY2UgLyBvcmlnaW5hbERhdGEub3JpZ2luYWxDb3N0KSAqIDEwMDtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBGaW5hbCB0b3RhbCBjb3N0OiAke2ZpbmFsVG90YWxDb3N0fSwgUHJpY2UgZGlmZmVyZW5jZTogJHtwcmljZURpZmZlcmVuY2V9LCBQcmljZSBkaWZmZXJlbmNlIHBlcmNlbnRhZ2U6ICR7cHJpY2VEaWZmZXJlbmNlUGVyY2VudGFnZX1gKTtcbiAgICAgICAgICAgIC8vIFVwZGF0ZSB0aGUgb3B0aW1hbENvbWJpbmF0aW9uIHRvIGluY2x1ZGUgdGhlIHByaWNlIGRpZmZlcmVuY2UgcGVyY2VudGFnZVxuICAgICAgICAgICAgb3B0aW1hbENvbWJpbmF0aW9uLmZvckVhY2goKGluc0RhdGEpID0+IHtcbiAgICAgICAgICAgICAgICBpbnNEYXRhLmNwdVV0aWwgPSBpbnNEYXRhLmNwdVV0aWwgKiB0YXJnZXRVdGlsO1xuICAgICAgICAgICAgICAgIGluc0RhdGEucHJpY2VEaWZmZXJlbmNlID0gcHJpY2VEaWZmZXJlbmNlUGVyY2VudGFnZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSWYgbm8gYmV0dGVyIGNvbWJpbmF0aW9uIGZvdW5kLCB1c2UgdGhlIG9yaWdpbmFsIGluc3RhbmNlXG4gICAgICAgICAgICAvL29wdGltYWxDb21iaW5hdGlvbiA9IFtbY2xvdWRJbnN0YW5jZSwgY3B1VXRpbCwgb3JpZ2luYWxNZW1VdGlsLCBjbG91ZEluc3RhbmNlLlJBTSwgY2xvdWRJbnN0YW5jZS5nZXRQcmljZShyZWdpb24pLCAwXV07XG4gICAgICAgICAgICBvcHRpbWFsQ29tYmluYXRpb24gPSBbe1xuICAgICAgICAgICAgICAgIGluc3RhbmNlOiBjbG91ZEluc3RhbmNlLFxuICAgICAgICAgICAgICAgIGNwdVV0aWw6IGNwdVV0aWwsXG4gICAgICAgICAgICAgICAgbWVtVXRpbDogb3JpZ2luYWxNZW1VdGlsLFxuICAgICAgICAgICAgICAgIHByaWNlOiBjbG91ZEluc3RhbmNlLmdldFByaWNlKHJlZ2lvbiksXG4gICAgICAgICAgICAgICAgcHJpY2VEaWZmZXJlbmNlOiAwXG4gICAgICAgICAgICB9XTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvcHRpbWFsQ29tYmluYXRpb247XG4gICAgfVxuICAgIFxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgZGF0YWJhc2VzIG9mIGNsb3VkIGluc3RhbmNlcy5cbiAgICAgKiBUaGlzIG1ldGhvZCBpcyB1c2VkIGZvciB0ZXN0aW5nIHB1cnBvc2VzLlxuICAgICAqIFxuICAgICAqIEByZXR1cm5zIFRoZSBkYXRhYmFzZXMgb2YgY2xvdWQgaW5zdGFuY2VzXG4gICAgICovXG4gICAgY29uc3QgZ2V0RGF0YWJhc2VzID0gKCk6IE1hcDxzdHJpbmcsIENQVURhdGFiYXNlPiA9PiB7XG4gICAgICAgIHJldHVybiBDYWNoZTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBtZXRhZGF0YSxcbiAgICAgICAgZXhlY3V0ZSxcbiAgICAgICAgZ2V0RGF0YWJhc2VzXG4gICAgfTtcbn0iXX0=