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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CPUDatabase = exports.CloudInstance = void 0;
const fs = __importStar(require("fs"));
const fs_async = __importStar(require("fs/promises"));
/**
 * Represents a cloud instance.
 */
class CloudInstance {
    /**
     * Constructs a CloudInstance.
     * @param model The model of the instance.
     * @param vCPUs The number of virtual CPUs.
     * @param RAM The amount of RAM in GB.
     * @param Price The price of the instance in different regions.
     */
    constructor(model, vCPUs, RAM, Price) {
        this.model = model;
        this.vCPUs = vCPUs;
        this.RAM = RAM;
        this.Price = Price;
    }
    getPrice(region) {
        if (this.Price) {
            if (this.Price[region]) {
                return this.Price[region];
            }
        }
        // return 0 will cause the division by 0 error
        return 0.0001;
    }
}
exports.CloudInstance = CloudInstance;
/**
 * Represents a CPU database.
 */
class CPUDatabase {
    constructor() {
        this.modelToFamily = new Map();
        this.familyToModels = new Map();
        this.nameToInstance = new Map();
    }
    /**
     * Retrieves an instance by model name.
     * @param modelName The model name of the instance.
     * @returns The CloudInstance corresponding to the model name, or null if not found.
     */
    getInstanceByModel(modelName) {
        const model = this.nameToInstance.get(modelName);
        return model || null;
    }
    /**
     * Loads model data from the specified path.
     * @param path The path to the JSON file containing model data.
     */
    async loadModelData(path) {
        try {
            const data = await fs_async.readFile(path, 'utf8');
            const jsonData = JSON.parse(data);
            for (const familyName in jsonData) {
                const models = jsonData[familyName];
                const cpuModels = models.map((model) => new CloudInstance(model.model, model.vCPUs, model.RAM, model.Price));
                this.familyToModels.set(familyName, cpuModels);
                models.forEach((model) => {
                    this.modelToFamily.set(model.model, familyName);
                    this.nameToInstance.set(model.model, new CloudInstance(model.model, model.vCPUs, model.RAM, model.Price));
                });
            }
        }
        catch (error) {
            console.error('Error reading file:', error);
        }
    }
    loadModelData_sync(path) {
        try {
            const data = fs.readFileSync(path, 'utf8');
            const jsonData = JSON.parse(data);
            for (const familyName in jsonData) {
                const models = jsonData[familyName];
                const cpuModels = models.map((model) => new CloudInstance(model.model, model.vCPUs, model.RAM, model.Price));
                this.familyToModels.set(familyName, cpuModels);
                models.forEach((model) => {
                    this.modelToFamily.set(model.model, familyName);
                    this.nameToInstance.set(model.model, new CloudInstance(model.model, model.vCPUs, model.RAM, model.Price));
                });
            }
        }
        catch (error) {
            console.error('Error reading file:', error);
        }
    }
    /**
     * Retrieves the model family based on a model name.
     * @param modelName The model name of the instance.
     * @returns The array of CloudInstance instances representing the model family, or null if not found.
     */
    getModelFamily(modelName) {
        const familyName = this.modelToFamily.get(modelName);
        return familyName ? this.familyToModels.get(familyName) || null : null;
    }
    /**
     * Get all the instance families in the database.
     * This method is for testing purposes only.
     *
     * @returns An array of the family names.
     */
    getFamilies() {
        return this.familyToModels;
    }
}
exports.CPUDatabase = CPUDatabase;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ1BVRmFtaWx5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xpYi9yaWdodC1zaXppbmcvQ1BVRmFtaWx5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsdUNBQXlCO0FBQ3pCLHNEQUF3QztBQUV4Qzs7R0FFRztBQUNILE1BQWEsYUFBYTtJQU10Qjs7Ozs7O09BTUc7SUFDSCxZQUFZLEtBQWEsRUFBRSxLQUFhLEVBQUUsR0FBVyxFQUFFLEtBQW1DO1FBQ3RGLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7SUFDdkIsQ0FBQztJQUVNLFFBQVEsQ0FBQyxNQUFjO1FBQzFCLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2IsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFDLENBQUM7Z0JBQ3BCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM5QixDQUFDO1FBQ0wsQ0FBQztRQUNELDhDQUE4QztRQUM5QyxPQUFPLE1BQU0sQ0FBQztJQUNsQixDQUFDO0NBQ0o7QUE3QkQsc0NBNkJDO0FBRUQ7O0dBRUc7QUFDSCxNQUFhLFdBQVc7SUFBeEI7UUFDWSxrQkFBYSxHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO1FBQzFDLG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQTJCLENBQUM7UUFDcEQsbUJBQWMsR0FBRyxJQUFJLEdBQUcsRUFBeUIsQ0FBQztJQXdFOUQsQ0FBQztJQXRFRzs7OztPQUlHO0lBQ0ksa0JBQWtCLENBQUMsU0FBaUI7UUFDdkMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDakQsT0FBTyxLQUFLLElBQUksSUFBSSxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7O09BR0c7SUFDSSxLQUFLLENBQUMsYUFBYSxDQUFDLElBQVk7UUFDbkMsSUFBSSxDQUFDO1lBQ0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNuRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xDLEtBQUssTUFBTSxVQUFVLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ2hDLE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDcEMsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFLENBQUMsSUFBSSxhQUFhLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ2xILElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDL0MsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO29CQUMxQixJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDO29CQUNoRCxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLElBQUksYUFBYSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUM5RyxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7UUFDTCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNiLE9BQU8sQ0FBQyxLQUFLLENBQUMscUJBQXFCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEQsQ0FBQztJQUNMLENBQUM7SUFFTSxrQkFBa0IsQ0FBQyxJQUFZO1FBQ2xDLElBQUksQ0FBQztZQUNELE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzNDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEMsS0FBSyxNQUFNLFVBQVUsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDaEMsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUNwQyxNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLGFBQWEsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDbEgsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUMvQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBVSxFQUFFLEVBQUU7b0JBQzFCLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7b0JBQ2hELElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsSUFBSSxhQUFhLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQzlHLENBQUMsQ0FBQyxDQUFDO1lBQ1AsQ0FBQztRQUNMLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2IsT0FBTyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNoRCxDQUFDO0lBQ0wsQ0FBQztJQUdEOzs7O09BSUc7SUFDSSxjQUFjLENBQUMsU0FBaUI7UUFDbkMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDckQsT0FBTyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQzNFLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNJLFdBQVc7UUFDZCxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUM7SUFDL0IsQ0FBQztDQUNKO0FBM0VELGtDQTJFQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIGZzX2FzeW5jIGZyb20gJ2ZzL3Byb21pc2VzJztcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgY2xvdWQgaW5zdGFuY2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBDbG91ZEluc3RhbmNlIHtcbiAgICBwdWJsaWMgbW9kZWw6IHN0cmluZztcbiAgICBwdWJsaWMgdkNQVXM6IG51bWJlcjtcbiAgICBwdWJsaWMgUkFNOiBudW1iZXI7XG4gICAgcHVibGljIFByaWNlOiB7IFtyZWdpb246IHN0cmluZ106IG51bWJlciB9O1xuXG4gICAgLyoqXG4gICAgICogQ29uc3RydWN0cyBhIENsb3VkSW5zdGFuY2UuXG4gICAgICogQHBhcmFtIG1vZGVsIFRoZSBtb2RlbCBvZiB0aGUgaW5zdGFuY2UuXG4gICAgICogQHBhcmFtIHZDUFVzIFRoZSBudW1iZXIgb2YgdmlydHVhbCBDUFVzLlxuICAgICAqIEBwYXJhbSBSQU0gVGhlIGFtb3VudCBvZiBSQU0gaW4gR0IuXG4gICAgICogQHBhcmFtIFByaWNlIFRoZSBwcmljZSBvZiB0aGUgaW5zdGFuY2UgaW4gZGlmZmVyZW50IHJlZ2lvbnMuXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobW9kZWw6IHN0cmluZywgdkNQVXM6IG51bWJlciwgUkFNOiBudW1iZXIsIFByaWNlOiB7IFtyZWdpb246IHN0cmluZ106IG51bWJlciB9KSB7XG4gICAgICAgIHRoaXMubW9kZWwgPSBtb2RlbDtcbiAgICAgICAgdGhpcy52Q1BVcyA9IHZDUFVzO1xuICAgICAgICB0aGlzLlJBTSA9IFJBTTtcbiAgICAgICAgdGhpcy5QcmljZSA9IFByaWNlO1xuICAgIH1cblxuICAgIHB1YmxpYyBnZXRQcmljZShyZWdpb246IHN0cmluZyk6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLlByaWNlKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5QcmljZVtyZWdpb25dKXtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5QcmljZVtyZWdpb25dO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIHJldHVybiAwIHdpbGwgY2F1c2UgdGhlIGRpdmlzaW9uIGJ5IDAgZXJyb3JcbiAgICAgICAgcmV0dXJuIDAuMDAwMTtcbiAgICB9XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIENQVSBkYXRhYmFzZS5cbiAqL1xuZXhwb3J0IGNsYXNzIENQVURhdGFiYXNlIHtcbiAgICBwcml2YXRlIG1vZGVsVG9GYW1pbHkgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICAgIHByaXZhdGUgZmFtaWx5VG9Nb2RlbHMgPSBuZXcgTWFwPHN0cmluZywgQ2xvdWRJbnN0YW5jZVtdPigpO1xuICAgIHByaXZhdGUgbmFtZVRvSW5zdGFuY2UgPSBuZXcgTWFwPHN0cmluZywgQ2xvdWRJbnN0YW5jZT4oKTtcblxuICAgIC8qKlxuICAgICAqIFJldHJpZXZlcyBhbiBpbnN0YW5jZSBieSBtb2RlbCBuYW1lLlxuICAgICAqIEBwYXJhbSBtb2RlbE5hbWUgVGhlIG1vZGVsIG5hbWUgb2YgdGhlIGluc3RhbmNlLlxuICAgICAqIEByZXR1cm5zIFRoZSBDbG91ZEluc3RhbmNlIGNvcnJlc3BvbmRpbmcgdG8gdGhlIG1vZGVsIG5hbWUsIG9yIG51bGwgaWYgbm90IGZvdW5kLlxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRJbnN0YW5jZUJ5TW9kZWwobW9kZWxOYW1lOiBzdHJpbmcpOiBDbG91ZEluc3RhbmNlIHwgbnVsbCB7XG4gICAgICAgIGNvbnN0IG1vZGVsID0gdGhpcy5uYW1lVG9JbnN0YW5jZS5nZXQobW9kZWxOYW1lKTtcbiAgICAgICAgcmV0dXJuIG1vZGVsIHx8IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTG9hZHMgbW9kZWwgZGF0YSBmcm9tIHRoZSBzcGVjaWZpZWQgcGF0aC5cbiAgICAgKiBAcGFyYW0gcGF0aCBUaGUgcGF0aCB0byB0aGUgSlNPTiBmaWxlIGNvbnRhaW5pbmcgbW9kZWwgZGF0YS5cbiAgICAgKi9cbiAgICBwdWJsaWMgYXN5bmMgbG9hZE1vZGVsRGF0YShwYXRoOiBzdHJpbmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBmc19hc3luYy5yZWFkRmlsZShwYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QganNvbkRhdGEgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBmYW1pbHlOYW1lIGluIGpzb25EYXRhKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbW9kZWxzID0ganNvbkRhdGFbZmFtaWx5TmFtZV07XG4gICAgICAgICAgICAgICAgY29uc3QgY3B1TW9kZWxzID0gbW9kZWxzLm1hcCgobW9kZWw6IGFueSkgPT4gbmV3IENsb3VkSW5zdGFuY2UobW9kZWwubW9kZWwsIG1vZGVsLnZDUFVzLCBtb2RlbC5SQU0sIG1vZGVsLlByaWNlKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5mYW1pbHlUb01vZGVscy5zZXQoZmFtaWx5TmFtZSwgY3B1TW9kZWxzKTtcbiAgICAgICAgICAgICAgICBtb2RlbHMuZm9yRWFjaCgobW9kZWw6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1vZGVsVG9GYW1pbHkuc2V0KG1vZGVsLm1vZGVsLCBmYW1pbHlOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uYW1lVG9JbnN0YW5jZS5zZXQobW9kZWwubW9kZWwsIG5ldyBDbG91ZEluc3RhbmNlKG1vZGVsLm1vZGVsLCBtb2RlbC52Q1BVcywgbW9kZWwuUkFNLCBtb2RlbC5QcmljZSkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgcmVhZGluZyBmaWxlOicsIGVycm9yKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBsb2FkTW9kZWxEYXRhX3N5bmMocGF0aDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gZnMucmVhZEZpbGVTeW5jKHBhdGgsICd1dGY4Jyk7XG4gICAgICAgICAgICBjb25zdCBqc29uRGF0YSA9IEpTT04ucGFyc2UoZGF0YSk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZhbWlseU5hbWUgaW4ganNvbkRhdGEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBtb2RlbHMgPSBqc29uRGF0YVtmYW1pbHlOYW1lXTtcbiAgICAgICAgICAgICAgICBjb25zdCBjcHVNb2RlbHMgPSBtb2RlbHMubWFwKChtb2RlbDogYW55KSA9PiBuZXcgQ2xvdWRJbnN0YW5jZShtb2RlbC5tb2RlbCwgbW9kZWwudkNQVXMsIG1vZGVsLlJBTSwgbW9kZWwuUHJpY2UpKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZhbWlseVRvTW9kZWxzLnNldChmYW1pbHlOYW1lLCBjcHVNb2RlbHMpO1xuICAgICAgICAgICAgICAgIG1vZGVscy5mb3JFYWNoKChtb2RlbDogYW55KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubW9kZWxUb0ZhbWlseS5zZXQobW9kZWwubW9kZWwsIGZhbWlseU5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm5hbWVUb0luc3RhbmNlLnNldChtb2RlbC5tb2RlbCwgbmV3IENsb3VkSW5zdGFuY2UobW9kZWwubW9kZWwsIG1vZGVsLnZDUFVzLCBtb2RlbC5SQU0sIG1vZGVsLlByaWNlKSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciByZWFkaW5nIGZpbGU6JywgZXJyb3IpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBSZXRyaWV2ZXMgdGhlIG1vZGVsIGZhbWlseSBiYXNlZCBvbiBhIG1vZGVsIG5hbWUuXG4gICAgICogQHBhcmFtIG1vZGVsTmFtZSBUaGUgbW9kZWwgbmFtZSBvZiB0aGUgaW5zdGFuY2UuXG4gICAgICogQHJldHVybnMgVGhlIGFycmF5IG9mIENsb3VkSW5zdGFuY2UgaW5zdGFuY2VzIHJlcHJlc2VudGluZyB0aGUgbW9kZWwgZmFtaWx5LCBvciBudWxsIGlmIG5vdCBmb3VuZC5cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0TW9kZWxGYW1pbHkobW9kZWxOYW1lOiBzdHJpbmcpOiBDbG91ZEluc3RhbmNlW10gfCBudWxsIHtcbiAgICAgICAgY29uc3QgZmFtaWx5TmFtZSA9IHRoaXMubW9kZWxUb0ZhbWlseS5nZXQobW9kZWxOYW1lKTtcbiAgICAgICAgcmV0dXJuIGZhbWlseU5hbWUgPyB0aGlzLmZhbWlseVRvTW9kZWxzLmdldChmYW1pbHlOYW1lKSB8fCBudWxsIDogbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgYWxsIHRoZSBpbnN0YW5jZSBmYW1pbGllcyBpbiB0aGUgZGF0YWJhc2UuXG4gICAgICogVGhpcyBtZXRob2QgaXMgZm9yIHRlc3RpbmcgcHVycG9zZXMgb25seS5cbiAgICAgKiBcbiAgICAgKiBAcmV0dXJucyBBbiBhcnJheSBvZiB0aGUgZmFtaWx5IG5hbWVzLlxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRGYW1pbGllcygpOiBNYXA8c3RyaW5nLCBDbG91ZEluc3RhbmNlW10+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZmFtaWx5VG9Nb2RlbHM7XG4gICAgfVxufVxuIl19