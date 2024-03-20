"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CPUDatabase = exports.CloudInstance = void 0;
const fs = require("fs");
const fs_async = require("fs/promises");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ1BVRmFtaWx5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2xpYi9yaWdodC1zaXppbmcvQ1BVRmFtaWx5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHlCQUF5QjtBQUN6Qix3Q0FBd0M7QUFFeEM7O0dBRUc7QUFDSCxNQUFhLGFBQWE7SUFNdEI7Ozs7OztPQU1HO0lBQ0gsWUFBWSxLQUFhLEVBQUUsS0FBYSxFQUFFLEdBQVcsRUFBRSxLQUFtQztRQUN0RixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0lBQ3ZCLENBQUM7SUFFTSxRQUFRLENBQUMsTUFBYztRQUMxQixJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNiLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBQyxDQUFDO2dCQUNwQixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDOUIsQ0FBQztRQUNMLENBQUM7UUFDRCw4Q0FBOEM7UUFDOUMsT0FBTyxNQUFNLENBQUM7SUFDbEIsQ0FBQztDQUNKO0FBN0JELHNDQTZCQztBQUVEOztHQUVHO0FBQ0gsTUFBYSxXQUFXO0lBQXhCO1FBQ1ksa0JBQWEsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztRQUMxQyxtQkFBYyxHQUFHLElBQUksR0FBRyxFQUEyQixDQUFDO1FBQ3BELG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQXlCLENBQUM7SUF3RTlELENBQUM7SUF0RUc7Ozs7T0FJRztJQUNJLGtCQUFrQixDQUFDLFNBQWlCO1FBQ3ZDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FB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LE9BQU8sQ0FBQyxLQUFLLENBQUMscUJBQXFCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEQsQ0FBQztJQUNMLENBQUM7SUFHRDs7OztPQUlHO0lBQ0ksY0FBYyxDQUFDLFNBQWlCO1FBQ25DLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3JELE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUMzRSxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSSxXQUFXO1FBQ2QsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDO0lBQy9CLENBQUM7Q0FDSjtBQTNFRCxrQ0EyRUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBmc19hc3luYyBmcm9tICdmcy9wcm9taXNlcyc7XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIGNsb3VkIGluc3RhbmNlLlxuICovXG5leHBvcnQgY2xhc3MgQ2xvdWRJbnN0YW5jZSB7XG4gICAgcHVibGljIG1vZGVsOiBzdHJpbmc7XG4gICAgcHVibGljIHZDUFVzOiBudW1iZXI7XG4gICAgcHVibGljIFJBTTogbnVtYmVyO1xuICAgIHB1YmxpYyBQcmljZTogeyBbcmVnaW9uOiBzdHJpbmddOiBudW1iZXIgfTtcblxuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdHMgYSBDbG91ZEluc3RhbmNlLlxuICAgICAqIEBwYXJhbSBtb2RlbCBUaGUgbW9kZWwgb2YgdGhlIGluc3RhbmNlLlxuICAgICAqIEBwYXJhbSB2Q1BVcyBUaGUgbnVtYmVyIG9mIHZpcnR1YWwgQ1BVcy5cbiAgICAgKiBAcGFyYW0gUkFNIFRoZSBhbW91bnQgb2YgUkFNIGluIEdCLlxuICAgICAqIEBwYXJhbSBQcmljZSBUaGUgcHJpY2Ugb2YgdGhlIGluc3RhbmNlIGluIGRpZmZlcmVudCByZWdpb25zLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKG1vZGVsOiBzdHJpbmcsIHZDUFVzOiBudW1iZXIsIFJBTTogbnVtYmVyLCBQcmljZTogeyBbcmVnaW9uOiBzdHJpbmddOiBudW1iZXIgfSkge1xuICAgICAgICB0aGlzLm1vZGVsID0gbW9kZWw7XG4gICAgICAgIHRoaXMudkNQVXMgPSB2Q1BVcztcbiAgICAgICAgdGhpcy5SQU0gPSBSQU07XG4gICAgICAgIHRoaXMuUHJpY2UgPSBQcmljZTtcbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0UHJpY2UocmVnaW9uOiBzdHJpbmcpOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy5QcmljZSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuUHJpY2VbcmVnaW9uXSl7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuUHJpY2VbcmVnaW9uXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyByZXR1cm4gMCB3aWxsIGNhdXNlIHRoZSBkaXZpc2lvbiBieSAwIGVycm9yXG4gICAgICAgIHJldHVybiAwLjAwMDE7XG4gICAgfVxufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBDUFUgZGF0YWJhc2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBDUFVEYXRhYmFzZSB7XG4gICAgcHJpdmF0ZSBtb2RlbFRvRmFtaWx5ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgICBwcml2YXRlIGZhbWlseVRvTW9kZWxzID0gbmV3IE1hcDxzdHJpbmcsIENsb3VkSW5zdGFuY2VbXT4oKTtcbiAgICBwcml2YXRlIG5hbWVUb0luc3RhbmNlID0gbmV3IE1hcDxzdHJpbmcsIENsb3VkSW5zdGFuY2U+KCk7XG5cbiAgICAvKipcbiAgICAgKiBSZXRyaWV2ZXMgYW4gaW5zdGFuY2UgYnkgbW9kZWwgbmFtZS5cbiAgICAgKiBAcGFyYW0gbW9kZWxOYW1lIFRoZSBtb2RlbCBuYW1lIG9mIHRoZSBpbnN0YW5jZS5cbiAgICAgKiBAcmV0dXJucyBUaGUgQ2xvdWRJbnN0YW5jZSBjb3JyZXNwb25kaW5nIHRvIHRoZSBtb2RlbCBuYW1lLCBvciBudWxsIGlmIG5vdCBmb3VuZC5cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0SW5zdGFuY2VCeU1vZGVsKG1vZGVsTmFtZTogc3RyaW5nKTogQ2xvdWRJbnN0YW5jZSB8IG51bGwge1xuICAgICAgICBjb25zdCBtb2RlbCA9IHRoaXMubmFtZVRvSW5zdGFuY2UuZ2V0KG1vZGVsTmFtZSk7XG4gICAgICAgIHJldHVybiBtb2RlbCB8fCBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIExvYWRzIG1vZGVsIGRhdGEgZnJvbSB0aGUgc3BlY2lmaWVkIHBhdGguXG4gICAgICogQHBhcmFtIHBhdGggVGhlIHBhdGggdG8gdGhlIEpTT04gZmlsZSBjb250YWluaW5nIG1vZGVsIGRhdGEuXG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGxvYWRNb2RlbERhdGEocGF0aDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgZnNfYXN5bmMucmVhZEZpbGUocGF0aCwgJ3V0ZjgnKTtcbiAgICAgICAgICAgIGNvbnN0IGpzb25EYXRhID0gSlNPTi5wYXJzZShkYXRhKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZmFtaWx5TmFtZSBpbiBqc29uRGF0YSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1vZGVscyA9IGpzb25EYXRhW2ZhbWlseU5hbWVdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNwdU1vZGVscyA9IG1vZGVscy5tYXAoKG1vZGVsOiBhbnkpID0+IG5ldyBDbG91ZEluc3RhbmNlKG1vZGVsLm1vZGVsLCBtb2RlbC52Q1BVcywgbW9kZWwuUkFNLCBtb2RlbC5QcmljZSkpO1xuICAgICAgICAgICAgICAgIHRoaXMuZmFtaWx5VG9Nb2RlbHMuc2V0KGZhbWlseU5hbWUsIGNwdU1vZGVscyk7XG4gICAgICAgICAgICAgICAgbW9kZWxzLmZvckVhY2goKG1vZGVsOiBhbnkpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tb2RlbFRvRmFtaWx5LnNldChtb2RlbC5tb2RlbCwgZmFtaWx5TmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmFtZVRvSW5zdGFuY2Uuc2V0KG1vZGVsLm1vZGVsLCBuZXcgQ2xvdWRJbnN0YW5jZShtb2RlbC5tb2RlbCwgbW9kZWwudkNQVXMsIG1vZGVsLlJBTSwgbW9kZWwuUHJpY2UpKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJlYWRpbmcgZmlsZTonLCBlcnJvcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgbG9hZE1vZGVsRGF0YV9zeW5jKHBhdGg6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IGZzLnJlYWRGaWxlU3luYyhwYXRoLCAndXRmOCcpO1xuICAgICAgICAgICAgY29uc3QganNvbkRhdGEgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBmYW1pbHlOYW1lIGluIGpzb25EYXRhKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbW9kZWxzID0ganNvbkRhdGFbZmFtaWx5TmFtZV07XG4gICAgICAgICAgICAgICAgY29uc3QgY3B1TW9kZWxzID0gbW9kZWxzLm1hcCgobW9kZWw6IGFueSkgPT4gbmV3IENsb3VkSW5zdGFuY2UobW9kZWwubW9kZWwsIG1vZGVsLnZDUFVzLCBtb2RlbC5SQU0sIG1vZGVsLlByaWNlKSk7XG4gICAgICAgICAgICAgICAgdGhpcy5mYW1pbHlUb01vZGVscy5zZXQoZmFtaWx5TmFtZSwgY3B1TW9kZWxzKTtcbiAgICAgICAgICAgICAgICBtb2RlbHMuZm9yRWFjaCgobW9kZWw6IGFueSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1vZGVsVG9GYW1pbHkuc2V0KG1vZGVsLm1vZGVsLCBmYW1pbHlOYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uYW1lVG9JbnN0YW5jZS5zZXQobW9kZWwubW9kZWwsIG5ldyBDbG91ZEluc3RhbmNlKG1vZGVsLm1vZGVsLCBtb2RlbC52Q1BVcywgbW9kZWwuUkFNLCBtb2RlbC5QcmljZSkpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgcmVhZGluZyBmaWxlOicsIGVycm9yKTtcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogUmV0cmlldmVzIHRoZSBtb2RlbCBmYW1pbHkgYmFzZWQgb24gYSBtb2RlbCBuYW1lLlxuICAgICAqIEBwYXJhbSBtb2RlbE5hbWUgVGhlIG1vZGVsIG5hbWUgb2YgdGhlIGluc3RhbmNlLlxuICAgICAqIEByZXR1cm5zIFRoZSBhcnJheSBvZiBDbG91ZEluc3RhbmNlIGluc3RhbmNlcyByZXByZXNlbnRpbmcgdGhlIG1vZGVsIGZhbWlseSwgb3IgbnVsbCBpZiBub3QgZm91bmQuXG4gICAgICovXG4gICAgcHVibGljIGdldE1vZGVsRmFtaWx5KG1vZGVsTmFtZTogc3RyaW5nKTogQ2xvdWRJbnN0YW5jZVtdIHwgbnVsbCB7XG4gICAgICAgIGNvbnN0IGZhbWlseU5hbWUgPSB0aGlzLm1vZGVsVG9GYW1pbHkuZ2V0KG1vZGVsTmFtZSk7XG4gICAgICAgIHJldHVybiBmYW1pbHlOYW1lID8gdGhpcy5mYW1pbHlUb01vZGVscy5nZXQoZmFtaWx5TmFtZSkgfHwgbnVsbCA6IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IGFsbCB0aGUgaW5zdGFuY2UgZmFtaWxpZXMgaW4gdGhlIGRhdGFiYXNlLlxuICAgICAqIFRoaXMgbWV0aG9kIGlzIGZvciB0ZXN0aW5nIHB1cnBvc2VzIG9ubHkuXG4gICAgICogXG4gICAgICogQHJldHVybnMgQW4gYXJyYXkgb2YgdGhlIGZhbWlseSBuYW1lcy5cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0RmFtaWxpZXMoKTogTWFwPHN0cmluZywgQ2xvdWRJbnN0YW5jZVtdPiB7XG4gICAgICAgIHJldHVybiB0aGlzLmZhbWlseVRvTW9kZWxzO1xuICAgIH1cbn1cbiJdfQ==