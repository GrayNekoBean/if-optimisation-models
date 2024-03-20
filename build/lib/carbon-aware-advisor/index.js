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
exports.CarbonAwareAdvisor = void 0;
const axios_1 = __importDefault(require("axios"));
const helpers_1 = require("../../util/helpers");
const errors_1 = require("../../util/errors");
const fs_1 = require("fs");
const path = __importStar(require("path"));
// Make sure you have the 'qs' library installed
const CarbonAwareAdvisor = (params) => {
    const { InputValidationError } = errors_1.ERRORS; //used for exceptions
    const metadata = {
        kind: 'execute'
    };
    /**
     * Route to the carbon-aware-sdk API. Localhost for now.
     */
    const API_URL = "http://localhost:5073";
    /**
     * Allowed location parameter that is passed in the config of the model.
     * The arguments are stored in a set to avoid duplicates.
     * the actual locations will populate this set during execution after certain checks
     */
    let allowedLocations = new Set();
    /**
     * Allowed timeframe parameter that is passed in the config of the model.
     * The arguments are stored in a set to avoid duplicates.
     * the actual timeframes will populate this set during execution after certain checks
     */
    let allowedTimeframes = new Set();
    /**
     * List of all locations that are supported by the carbon-aware-sdk.
     * This is used to validate the inputs provided by the user.
     * Initialized by reading the locations.json file in the setSupportedLocations() function.
     */
    let supportedLocations = new Set();
    // Use for read from locations.json . We need to be careful when we commit to the impact framework dir for this path
    let locationsFilePath = path.join(process.cwd(), 'data', 'locations.json');
    //flag to check if the model has sampling, the sampling value is originally set to 0
    let hasSampling = false;
    let sampling = 0;
    //number of last days to get average score
    const lastDaysNumber = 10;
    //weights for the forecasting, the first weight is that of the average of last 10 days and the second weight is that of the last available year on that date
    //the weights must sum to 1
    const weights = [0.5, 0.5];
    //Error builder function that is used to build error messages. 
    let errorBuilder = (0, helpers_1.buildErrorMessage)('CarbonAwareAdvisor');
    /**
    * this function is the main function of the model, it is called by the impl file
    * it takes the inputs from the impl file and returns the results of the model
    * it validates them that all the required parameters are provided and are of the correct type
    * and then calls the calculate function to perform the actual calculations
    * @param inputs the inputs from the impl file
    * @returns the results of the model
    */
    const execute = async (inputs) => {
        // await validateInputs(configs);
        //echo that you are in the execute function
        await validateInputs();
        console.log('You are in the execute function');
        //call the calculate function to perform the actual calculations
        return await calculate(inputs);
    };
    /**
    * this is the function that performs all the api calls and returns the actual results,
    * it is the core of the CarbonAware Advisor model and it is called by the execute function
    */
    const calculate = async (inputs) => {
        //depending on if we have sampling or not the result map that will be returned will be different. 
        //if hassampling =true then we need plotted points as well
        let results = [];
        if (hasSampling) {
            results = inputs.map(input => ({
                ...input,
                suggestions: [],
                'plotted-points': []
            }));
        }
        else {
            results = inputs.map(input => ({
                ...input,
                suggestions: []
            }));
        }
        // create an array from the global locationsArray set that was populated during the validation of the inputs
        const locationsArray = [...allowedLocations];
        let BestData = [];
        let plotted_points = [];
        let AllBestData = [];
        // We define a map averageScoresByLocation to find the average score for each location for the last lastDaysNumber days
        const averageScoresByLocation = {};
        // For each location, get the average score for the last lastDaysNumber days
        for (const location of locationsArray) {
            console.log(`Getting average score for location ${location} over the last ${lastDaysNumber} days`);
            // Get the average score for the location for lastDaysNumber days
            const averageScore = await getAverageScoreForLastXDays(lastDaysNumber, location);
            // Store the average score in the dictionary with the location as the key
            averageScoresByLocation[location] = averageScore;
        }
        //if we have sampling then calculate the allocations of the plotted points per timeframe
        const allocations = hasSampling ? calculateSubrangeAllocation(sampling) : [1];
        //Print the allocations and the average scores by location
        console.log('Allocations:', allocations);
        console.log("Average Scores by Location:", averageScoresByLocation);
        // For each timeframe, get the response from the API
        for (const [index, timeframe] of Array.from(allowedTimeframes).entries()) {
            // Get the current allocation for that timeframe (how many plotted points we need to extract from that specific timeframe)
            const currAllocation = allocations[index] - 1;
            //isForecast is a variable telling us if the current timeframe is in the future (meanin that there is no data from the APi for that timeframe)
            let isForecast = false;
            //numOfYears is a variable that tells us how many years we have gone in the past to find data for that forecast
            let numOfYears = 0;
            let mutableTimeframe = timeframe;
            while (true) {
                // Prepare parameters for the API call
                const params = {
                    location: locationsArray,
                    time: mutableTimeframe.from,
                    toTime: mutableTimeframe.to
                };
                //if params,time and params.toTime are before now we dont have a forecast
                if (params.time < new Date().toISOString() && params.toTime < new Date().toISOString()) {
                    // Returns an array of all EmissionsData objects for that timeframe and locations
                    let api_response = await getResponse("/emissions/bylocations", 'GET', params);
                    if (api_response.length > 0) {
                        console.log(`API call succeeded for timeframe starting at ${timeframe.from} `);
                        //if the api call is a forecast then we need to normalize the values to change the year and the rating
                        //for example if we made a forecat for 2025 and we are in 2023 then we need to adjust the year back to 2025 and the rating based on the weights
                        if (isForecast) {
                            api_response = adjustRatingsAndYears(api_response, numOfYears, averageScoresByLocation);
                        }
                        //the minRating is the rating from the EmissionsData  of the response that is the lowest
                        const minRating = Math.min(...api_response.map((item) => item.rating));
                        // here we find all the EmissionsData objects from the response that have the lowest rating
                        const itemsWithMinRating = api_response.filter((item) => item.rating === minRating);
                        // We store  that  EmissionsData objects from the response that have the lowest rating
                        BestData = BestData.concat(itemsWithMinRating);
                        //if we have sampling then we need to store the one (at random) of the minimum EmissionsData objects to be returned in the plotted points
                        const randomIndex = Math.floor(Math.random() * itemsWithMinRating.length);
                        plotted_points.push(itemsWithMinRating[randomIndex]);
                        // All of the EmissionsData objects from the response that have the lowest rating are stored in AllBestData, where the best of all api calls will be stored
                        AllBestData = [...AllBestData, ...itemsWithMinRating];
                        //if hasSampling is true  then we need more than the best value, we need some extra values to be returned in the plotted points (as many as the allocation says)
                        if (hasSampling) {
                            //remove from best array all the elements that are in itemsWithMinRating, we have already stored one of them
                            api_response = api_response.filter((item) => !itemsWithMinRating.includes(item));
                            //select currAllocation elemnets at random from the remaining items in the api_response array
                            //and add them to the plotted_points
                            for (let i = 0; i < currAllocation; i++) {
                                const randIndex = Math.floor(Math.random() * api_response.length);
                                plotted_points.push(api_response.splice(randIndex, 1)[0]);
                            }
                        }
                        break; // Break the loop if we have found data for the current timeframe and locations and search for the next timeframe
                    }
                }
                //if we have reached this part of the code then that means that for this timeframe we are forecasting
                isForecast = true;
                // Adjust timeframe by decreasing the year by one to do an API call for the previous year the enxt time
                mutableTimeframe = await adjustTimeframeByOneYear(mutableTimeframe);
                //increase the numOfYears we have gone in the past by 1
                numOfYears++;
                if (numOfYears > 5) { // if you cant find any data 5 years in the past then stop searching
                    break;
                }
            }
        }
        // In the AllBestData we have the best values from all the api calls (so for each timeframe), we need to return the best of the best.
        const lowestRating = Math.min(...AllBestData.map(item => item.rating));
        // Filter all responses to get items with the lowest rating (i.e. the best responses)
        const finalSuggestions = AllBestData.filter(item => item.rating === lowestRating);
        // Store the final suggestions in the output results
        results[0].suggestions = finalSuggestions;
        // If we have sampling in the result we return the plotted points as well which have samples from different timeframe and locations
        if (hasSampling) {
            results[0].plotted_points = plotted_points;
        }
        return results;
    };
    /**
    * this function adjusts the ratings and years of the forecasted data
    * it takes the forecasted data, the number of years to add and the average scores by location
    * it returns the adjusted forecasted data
    @param emissionsData The emissions that need  to be adjustes.
    @param yearsToAdd how many years in the future the forecast is
    @param averageScoresByLocation the average scores by location for the last 10 days
    */
    const adjustRatingsAndYears = (emissionsData, yearsToAdd, averageScoresByLocation) => {
        return emissionsData.map(data => {
            //get the average rating for the specific location
            const averageRating = averageScoresByLocation[data.location];
            //if the average rating is null then we dont have data for the last 10 days for that location
            //and we will base the rating only on the old value (not normalise based on the last 10 days average rating)
            //adjust the rating of this location based on the weights
            const adjustedRating = averageRating !== null ? (data.rating * weights[0] + averageRating * weights[1]) : data.rating; // Handle null values
            //create the new date by making the year equal to the year of the forecast(by adding the years we have gone in the past)
            const time = new Date(data.time);
            time.setFullYear(time.getFullYear() + yearsToAdd);
            //return the adjusted data
            return { ...data, rating: adjustedRating, time: time.toISOString() };
        });
    };
    /**
     * Adjust the timeframe by decreasing the year by one.
     * @param timeframe The timeframe to adjust.
     * @returns The adjusted timeframe which is one year in the past
     * we need this function to adjust the timeframe if the timeframe is in the future and we need to perform an api call in the past
     */
    const adjustTimeframeByOneYear = (timeframe) => {
        // Adjust the year of the timeframe by decreasing it by one
        const adjustYear = (dateString) => {
            const date = new Date(dateString);
            date.setFullYear(date.getFullYear() - 1);
            return date.toISOString();
        };
        //return the adjusted timeframe by decreasing the year by one for the start of the timeframe and the end of the timeframe
        return {
            from: adjustYear(timeframe.from),
            to: adjustYear(timeframe.to),
        };
    };
    /**
     * Set the supported locations based on the locations.json file
     * the supported locations are the locations that the model can perform api calls for
     * but also include key word regions (such as europe) that are sets of multiple locations
     */
    const setSupportedLocations = async () => {
        // Get the list of supported locations from the locarions.json file
        const localData = await loadLocations();
        // For each region in localData,  and the locations of that region to the set of supported locations
        Object.keys(localData).forEach(key => {
            const locationsArray = localData[key];
            locationsArray.forEach((location) => {
                // Add each server to the set of supported locations
                supportedLocations.add(location);
            });
            // Add each region itself to the set of supported locations
            supportedLocations.add(key);
        });
    };
    /**
     * Send a request to the carbon-aware-sdk API.
     * @param route The route to send the request to. We mostly use '/emissions/bylocations' to get the emissions data
     * @param method The HTTP method to use.
     * @param params The map of parameters to send with the request.
     * @returns The response from the API of any type.
     * @throws Error if the request fails and stops the execution of the model.
     */
    const getResponse = async (route, method = 'GET', params = null) => {
        const url = new URL(`${API_URL}${route}`);
        // Manually serialize params to match the required format: 'location=eastus&location=westus&...'
        let queryString = '';
        if (params) {
            queryString = Object.entries(params).map(([key, value]) => {
                if (Array.isArray(value)) {
                    // Convert each value to a string before encoding and repeat the key for each value in the array
                    return value.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`).join('&');
                }
                else {
                    // Convert value to a string before encoding and directly append to query string
                    return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
                }
            }).join('&');
        }
        //the final url is the url of the api call we will be performing
        const finalUrl = `${url}${queryString ? '?' + queryString : ''}`;
        console.log(`Sending ${method} request to ${finalUrl}`);
        let attempts = 0;
        const maxAttempts = 3; // Initial attempt + 2 retries if we get error 500 from the API
        while (attempts < maxAttempts) {
            try {
                const response = await (0, axios_1.default)({
                    url: finalUrl,
                    method: method,
                });
                //if the api call is successful then return the data
                return response.data;
            }
            catch (error) {
                //if we get an error from the api
                attempts++;
                // Use a type guard to check if the error is an AxiosError
                if (axios_1.default.isAxiosError(error)) {
                    const axiosError = error;
                    console.error(axiosError.message);
                    //if we get error 500 then retry the api call up to 2 more times
                    if (axiosError.response && axiosError.response.status === 500 && attempts < maxAttempts) {
                        console.log(`Attempt ${attempts} failed with status 500. Retrying...`);
                    }
                    else {
                        console.log();
                        throwError(Error, axiosError.message);
                    }
                }
                else {
                    // If it's not an AxiosError, it might be some other error (like a network error, etc.)
                    throwError(Error, 'An unexpected error occurred');
                }
            }
        }
    };
    /**
     * Validate the inputs provided by the user to make sure that all required parameters are provided and are of the correct type.
     * @param inputs The inputs provided by the user.
     * @throws InputValidationError if the inputs are invalid and stops the execution of the model.
     */
    const validateInputs = async () => {
        console.log('Input validation: ', JSON.stringify(params, null, 2));
        if (params === undefined || params === null || Object.keys(params).length === 0) {
            throwError(InputValidationError, 'Required Parameters not provided');
        }
        await setSupportedLocations(); // Set the supported locations based on the locations.json file to see if the locations we got as inputs are among them
        validateParams(); // Validate params
        console.log('Validation complete.');
    };
    /**
     * Validate the inputs provided by the user to make sure that all required parameters are provided and are of the correct type.
     * Here we are sure that some inputs have been provided and we have set the supported locations
     * @param params The inputs provided by the user in the impl file
     * @throws InputValidationError if the inputs are invalid and stops the execution of the model.
     */
    const validateParams = () => {
        //print the params received from the impl file for debugging puproses
        //console.log("The params received from the impl:",JSON.stringify(params));
        // Check if the 'allowed-locations' property exists in the impl file
        if (params && params['allowed-locations'] !== undefined) {
            const locs = params['allowed-locations'];
            // validate that the locations are corect
            validateLocations(locs);
        }
        else {
            throwError(InputValidationError, `Required Parameter allowed-locations not provided`);
        }
        // Check if the 'allowed-timeframes' property exists in the impl file
        if (params && params['allowed-timeframes'] !== undefined) {
            const times = params['allowed-timeframes'];
            // validate that the timeframes are correct
            validateTimeframes(times);
        }
        else {
            throwError(InputValidationError, `Required Parameter allowed-timeframes not provided`);
        }
        // Check if the 'sampling' property exists in the impl file
        if (params && params['sampling'] !== undefined) {
            const sample = params['sampling'];
            // Further processing with locs
            console.log('`sampling` provided:', sample);
            validateSampling(sample);
        }
        else {
            console.log('Sampling not provided, ignoring');
        }
    };
    /**
     * Validate the sampling parameter to make sure that it is a positive number.
     * @param sampling The sampling parameter provided by the user.
     * @throws InputValidationError if the sampling parameter is invalid and stops the execution of the model.
     * @returns void
     */
    const validateSampling = (sample) => {
        // Check if sampling is a positive number  and populate the global params hasSampling and sampling
        hasSampling = sample > 0;
        sampling = sample;
        if (!hasSampling || typeof sampling !== 'number' || sampling <= 0) {
            console.warn('`sampling` provided but not a positive number. Ignoring `sampling`.');
        }
    };
    /**
    * Validate the allowed-locations parameter to make sure that it is an array of locations
    * and that those locations are supported
    * @param locs The array of allowed locations provided by the user in the impl
    * @throws InputValidationError if the allowed locations parameter is invalid or some of the locations are unsupported and stops the execution of the model.
    * @returns void
    */
    const validateLocations = (locs) => {
        if (!Array.isArray(locs) || locs.length === 0) {
            throwError(InputValidationError, `Required Parameter 'allowed-locations' is empty`);
        }
        locs.forEach((location) => {
            //check that the locations in the impl are some of the supported locations
            if (!supportedLocations.has(location)) {
                throwError(InputValidationError, `Location ${location} is not supported`);
            }
            allowedLocations.add(location); // populate the global set of allowedLocations
        });
    };
    /**
    * Validate the allowed-timeframes parameter to make sure that it is an array of timeframes
    * and that those timeframes are valid
    * @param timeframes The array of allowed timeframes provided by the user in the impl
    * @throws InputValidationError if the allowed timeframes parameter is invalid or some of the timeframes are invalid and stops the execution of the model.
    * @returns void
    */
    const validateTimeframes = (timeframes) => {
        if (!Array.isArray(timeframes) || timeframes.length === 0) {
            throwError(InputValidationError, `Required Parameter allowed-timeframes is empty`);
        }
        // For each timeframe provided, check if it is valid and add it to the set of allowed timeframes
        timeframes.forEach((timeframe) => {
            // For each timeframe provided, check if it is valid
            const [from, to] = timeframe.split(' - ');
            if (from === undefined || to === undefined) {
                throwError(InputValidationError, `Timeframe ${timeframe} is invalid`);
            }
            // Check if the start and end times are valid dates
            if (isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
                throwError(InputValidationError, `Timeframe ${timeframe} is invalid`);
            }
            // Check if start is before end
            if (from >= to) {
                throwError(InputValidationError, `Start time ${from} must be before end time ${to}`);
            }
            allowedTimeframes.add({
                from: from,
                to: to
            });
        });
    };
    /**
     * this function calculates the allocation of the samples to the timeframes
     * there must be at least one sample per timeframe
     * if samples < number of timeframes then an error is thrown
     * @param sampling the number of samples needed
     * @returns the allocation of the samples to the timeframes meaning how many samples we must select from each timeframe
     * in order to have a unifrom distribution of the samples
     * (for example if one timeframe is very long we will select more samples from it than from a shorter timeframe)
     */
    const calculateSubrangeAllocation = (sampling) => {
        //if samples < number of timeframes then an error is thrown
        const timeframesCount = allowedTimeframes.size;
        if (sampling < timeframesCount) {
            throw new Error("Sampling number too small for the number of timeframes.");
        }
        //returns the duration of each timeframe
        const durations = Array.from(allowedTimeframes).map(timeframe => {
            const start = new Date(timeframe.from).getTime();
            const end = new Date(timeframe.to).getTime();
            return (end - start) / 1000; // Duration in seconds
        });
        //the total duration is the sum of all the durations
        const totalDuration = durations.reduce((a, b) => a + b, 0);
        // Initial allocation of 1 sample per timeframe
        let allocations = durations.map(_ => 1);
        let remainingSamples = sampling - timeframesCount; // Adjust remaining samples
        // Proportional allocation of the remaining samples
        if (totalDuration > 0) {
            const remainingDurations = durations.map(duration => duration / totalDuration * remainingSamples);
            for (let i = 0; i < allocations.length; i++) {
                allocations[i] += Math.round(remainingDurations[i]);
            }
        }
        // Redistribution to ensure total matches sampling
        let totalAllocated = allocations.reduce((a, b) => a + b, 0);
        while (totalAllocated !== sampling) {
            if (totalAllocated > sampling) {
                for (let i = 0; i < allocations.length && totalAllocated > sampling; i++) {
                    if (allocations[i] > 1) {
                        allocations[i] -= 1;
                        totalAllocated -= 1;
                    }
                }
            }
            else {
                for (let i = 0; i < allocations.length && totalAllocated < sampling; i++) {
                    allocations[i] += 1;
                    totalAllocated += 1;
                }
            }
        }
        return allocations;
    };
    /**
     * this function throws an error of a specific type and message
     * @param type the type of the error
     * @param message the message of the error
     * @throws the error of the specific type and message
     * @returns void
     */
    const throwError = (type, message) => {
        throw new type(errorBuilder({ message }));
    };
    /**
     * this function loads the locations from the locations.json file
     * @returns the locations object from the locations.json file
     */
    const loadLocations = async () => {
        try {
            //get the data from the locations.json file
            const data = await fs_1.promises.readFile(locationsFilePath, 'utf-8');
            const locationsObject = JSON.parse(data);
            return locationsObject;
        }
        catch (error) {
            throw new Error("Failed to read from locations.json. Please check the file and its path and try again.");
        }
    };
    /**
    * Calculates the average score for a given location over the last days days.
    *
    * @param days The number of days to look back from the current date.
    * @param location The location for which to calculate the average score.
    * @returns The average score for the specified location over the last days days.
    */
    const getAverageScoreForLastXDays = async (days, location) => {
        // Calculate the start date by subtracting days number of days from the current date
        const toTime = new Date();
        const time = new Date(toTime.getTime() - days * 24 * 60 * 60 * 1000);
        //print the start and finish time
        console.log('Start time for the average score of the last:', days, 'number of days is: ', time.toISOString());
        console.log('Finish time for the average score of the last:', days, 'number of days is: ', toTime.toISOString());
        // Prepare parameters for the API call
        const params = {
            location: location,
            time: time.toISOString(),
            toTime: toTime.toISOString(),
        };
        try {
            // Make the API call to retrieve emissions data for the last 10 days for the specified location
            const response = await getResponse('/emissions/bylocations', 'GET', params);
            // Check if the response contains data
            if (response && response.length > 0) {
                // Calculate the average score from the response data
                const totalrating = response.reduce((acc, curr) => acc + curr.rating, 0);
                const averagerating = totalrating / response.length;
                return averagerating;
            }
            else {
                // no data available for the specified location and time frame
                console.log('No data available for thethe last ', days, 'days for location:', location);
                console.log('Returning null so potential issue if you perfom forecasting for this location');
                return null;
            }
        }
        catch (error) {
            console.error('Failed to retrieve emissions data:', error);
            throw error;
        }
    };
    // the CarbonAwareAdvisor returns the metadata and the execute function
    // so that eans that every time this model is run the execute function will be called
    return {
        metadata,
        execute,
        getAverageScoreForLastXDays,
        supportedLocations
    };
};
exports.CarbonAwareAdvisor = CarbonAwareAdvisor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbGliL2NhcmJvbi1hd2FyZS1hZHZpc29yL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsa0RBQTBCO0FBRzFCLGdEQUF1RDtBQUN2RCw4Q0FBMkM7QUFDM0MsMkJBQTRDO0FBQzVDLDJDQUE2QjtBQUc3QixnREFBZ0Q7QUFDekMsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLE1BQW9CLEVBQW1CLEVBQUU7SUFDMUUsTUFBTSxFQUFFLG9CQUFvQixFQUFFLEdBQUcsZUFBTSxDQUFDLENBQUMscUJBQXFCO0lBUzlELE1BQU0sUUFBUSxHQUFHO1FBQ2YsSUFBSSxFQUFFLFNBQVM7S0FDaEIsQ0FBQztJQUVGOztPQUVHO0lBQ0gsTUFBTSxPQUFPLEdBQUcsdUJBQXVCLENBQUM7SUFFeEM7Ozs7T0FJRztJQUVILElBQUksZ0JBQWdCLEdBQWdCLElBQUksR0FBRyxFQUFFLENBQUM7SUFFOUM7Ozs7T0FJRztJQUNILElBQUksaUJBQWlCLEdBQW1CLElBQUksR0FBRyxFQUFFLENBQUM7SUFFbEQ7Ozs7T0FJRztJQUNILElBQUksa0JBQWtCLEdBQWdCLElBQUksR0FBRyxFQUFFLENBQUM7SUFDaEQsb0hBQW9IO0lBQ3BILElBQUksaUJBQWlCLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFHM0Usb0ZBQW9GO0lBQ3BGLElBQUksV0FBVyxHQUFZLEtBQUssQ0FBQztJQUNqQyxJQUFJLFFBQVEsR0FBVyxDQUFDLENBQUM7SUFFekIsMENBQTBDO0lBQzFDLE1BQU0sY0FBYyxHQUFXLEVBQUUsQ0FBQztJQUVsQyw0SkFBNEo7SUFDNUosMkJBQTJCO0lBQzNCLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FB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LENBQUM7WUFFNUUsc0NBQXNDO1lBQ3RDLElBQUksUUFBUSxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BDLHFEQUFxRDtnQkFDckQsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQVcsRUFBRSxJQUF3QixFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDckcsTUFBTSxhQUFhLEdBQUcsV0FBVyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUM7Z0JBQ3BELE9BQU8sYUFBYSxDQUFDO1lBQ3ZCLENBQUM7aUJBQU0sQ0FBQztnQkFDTiw4REFBOEQ7Z0JBQzlELE9BQU8sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixFQUFFLFFBQVEsQ0FBRSxDQUFDO2dCQUN6RixPQUFPLENBQUMsR0FBRyxDQUFDLCtFQUErRSxDQUFDLENBQUM7Z0JBQzdGLE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQztRQUNILENBQUM7UUFDRCxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2IsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzRCxNQUFNLEtBQUssQ0FBQztRQUNkLENBQUM7SUFDSCxDQUFDLENBQUE7SUFFRCx1RUFBdUU7SUFDdkUscUZBQXFGO0lBQ3JGLE9BQU87UUFDTCxRQUFRO1FBQ1IsT0FBTztRQUNQLDJCQUEyQjtRQUMzQixrQkFBa0I7S0FDbkIsQ0FBQztBQUNKLENBQUMsQ0FBQTtBQWptQlksUUFBQSxrQkFBa0Isc0JBaW1COUIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgYXhpb3MgZnJvbSAnYXhpb3MnO1xuaW1wb3J0IHsgUGx1Z2luSW50ZXJmYWNlIH0gZnJvbSAnLi4vLi4vaW50ZXJmYWNlcyc7XG5pbXBvcnQgeyBDb25maWdQYXJhbXMsIFBsdWdpblBhcmFtcyB9IGZyb20gJy4uLy4uL3R5cGVzL2NvbW1vbic7XG5pbXBvcnQgeyBidWlsZEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uL3V0aWwvaGVscGVycyc7XG5pbXBvcnQgeyBFUlJPUlMgfSBmcm9tICcuLi8uLi91dGlsL2Vycm9ycyc7XG5pbXBvcnQgeyBwcm9taXNlcyBhcyBmc1Byb21pc2VzIH0gZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuXG4vLyBNYWtlIHN1cmUgeW91IGhhdmUgdGhlICdxcycgbGlicmFyeSBpbnN0YWxsZWRcbmV4cG9ydCBjb25zdCBDYXJib25Bd2FyZUFkdmlzb3IgPSAocGFyYW1zOiBDb25maWdQYXJhbXMpOiBQbHVnaW5JbnRlcmZhY2UgPT4ge1xuICBjb25zdCB7IElucHV0VmFsaWRhdGlvbkVycm9yIH0gPSBFUlJPUlM7IC8vdXNlZCBmb3IgZXhjZXB0aW9uc1xuXG4gIGludGVyZmFjZSBFbWlzc2lvbnNEYXRhIHsgLy9pbnRlcmZhY2UgZm9yIHRoZSBlbWlzc2lvbnMgZGF0YSByZXR1cm5lZCBieSB0aGUgQVBJXG4gICAgbG9jYXRpb246IHN0cmluZztcbiAgICB0aW1lOiBzdHJpbmc7XG4gICAgcmF0aW5nOiBudW1iZXI7XG4gICAgZHVyYXRpb246IHN0cmluZztcbiAgfVxuXG4gIGNvbnN0IG1ldGFkYXRhID0geyAgLy9uZWNlc3NhcnkgbWV0YWRhdGEgcmV0dXJybmVkIGJ5IHRoZSBuZXcgdmVyc2lvbiBvZiB0aGUgaW1wYWN0IGVuZ2luZSBpbnRlcmZhY2VcbiAgICBraW5kOiAnZXhlY3V0ZSdcbiAgfTtcblxuICAvKipcbiAgICogUm91dGUgdG8gdGhlIGNhcmJvbi1hd2FyZS1zZGsgQVBJLiBMb2NhbGhvc3QgZm9yIG5vdy5cbiAgICovXG4gIGNvbnN0IEFQSV9VUkwgPSBcImh0dHA6Ly9sb2NhbGhvc3Q6NTA3M1wiO1xuXG4gIC8qKlxuICAgKiBBbGxvd2VkIGxvY2F0aW9uIHBhcmFtZXRlciB0aGF0IGlzIHBhc3NlZCBpbiB0aGUgY29uZmlnIG9mIHRoZSBtb2RlbC5cbiAgICogVGhlIGFyZ3VtZW50cyBhcmUgc3RvcmVkIGluIGEgc2V0IHRvIGF2b2lkIGR1cGxpY2F0ZXMuXG4gICAqIHRoZSBhY3R1YWwgbG9jYXRpb25zIHdpbGwgcG9wdWxhdGUgdGhpcyBzZXQgZHVyaW5nIGV4ZWN1dGlvbiBhZnRlciBjZXJ0YWluIGNoZWNrc1xuICAgKi9cblxuICBsZXQgYWxsb3dlZExvY2F0aW9uczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cbiAgLyoqXG4gICAqIEFsbG93ZWQgdGltZWZyYW1lIHBhcmFtZXRlciB0aGF0IGlzIHBhc3NlZCBpbiB0aGUgY29uZmlnIG9mIHRoZSBtb2RlbC5cbiAgICogVGhlIGFyZ3VtZW50cyBhcmUgc3RvcmVkIGluIGEgc2V0IHRvIGF2b2lkIGR1cGxpY2F0ZXMuXG4gICAqIHRoZSBhY3R1YWwgdGltZWZyYW1lcyB3aWxsIHBvcHVsYXRlIHRoaXMgc2V0IGR1cmluZyBleGVjdXRpb24gYWZ0ZXIgY2VydGFpbiBjaGVja3NcbiAgICovXG4gIGxldCBhbGxvd2VkVGltZWZyYW1lczogU2V0PFRpbWVmcmFtZT4gPSBuZXcgU2V0KCk7XG5cbiAgLyoqXG4gICAqIExpc3Qgb2YgYWxsIGxvY2F0aW9ucyB0aGF0IGFyZSBzdXBwb3J0ZWQgYnkgdGhlIGNhcmJvbi1hd2FyZS1zZGsuXG4gICAqIFRoaXMgaXMgdXNlZCB0byB2YWxpZGF0ZSB0aGUgaW5wdXRzIHByb3ZpZGVkIGJ5IHRoZSB1c2VyLlxuICAgKiBJbml0aWFsaXplZCBieSByZWFkaW5nIHRoZSBsb2NhdGlvbnMuanNvbiBmaWxlIGluIHRoZSBzZXRTdXBwb3J0ZWRMb2NhdGlvbnMoKSBmdW5jdGlvbi5cbiAgICovXG4gIGxldCBzdXBwb3J0ZWRMb2NhdGlvbnM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuICAvLyBVc2UgZm9yIHJlYWQgZnJvbSBsb2NhdGlvbnMuanNvbiAuIFdlIG5lZWQgdG8gYmUgY2FyZWZ1bCB3aGVuIHdlIGNvbW1pdCB0byB0aGUgaW1wYWN0IGZyYW1ld29yayBkaXIgZm9yIHRoaXMgcGF0aFxuICBsZXQgbG9jYXRpb25zRmlsZVBhdGggPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ2RhdGEnLCAnbG9jYXRpb25zLmpzb24nKTtcblxuXG4gIC8vZmxhZyB0byBjaGVjayBpZiB0aGUgbW9kZWwgaGFzIHNhbXBsaW5nLCB0aGUgc2FtcGxpbmcgdmFsdWUgaXMgb3JpZ2luYWxseSBzZXQgdG8gMFxuICBsZXQgaGFzU2FtcGxpbmc6IGJvb2xlYW4gPSBmYWxzZTtcbiAgbGV0IHNhbXBsaW5nOiBudW1iZXIgPSAwO1xuXG4gIC8vbnVtYmVyIG9mIGxhc3QgZGF5cyB0byBnZXQgYXZlcmFnZSBzY29yZVxuICBjb25zdCBsYXN0RGF5c051bWJlcjogbnVtYmVyID0gMTA7XG5cbiAgLy93ZWlnaHRzIGZvciB0aGUgZm9yZWNhc3RpbmcsIHRoZSBmaXJzdCB3ZWlnaHQgaXMgdGhhdCBvZiB0aGUgYXZlcmFnZSBvZiBsYXN0IDEwIGRheXMgYW5kIHRoZSBzZWNvbmQgd2VpZ2h0IGlzIHRoYXQgb2YgdGhlIGxhc3QgYXZhaWxhYmxlIHllYXIgb24gdGhhdCBkYXRlXG4gIC8vdGhlIHdlaWdodHMgbXVzdCBzdW0gdG8gMVxuICBjb25zdCB3ZWlnaHRzID0gWzAuNSwgMC41XTtcblxuXG4gIC8vRXJyb3IgYnVpbGRlciBmdW5jdGlvbiB0aGF0IGlzIHVzZWQgdG8gYnVpbGQgZXJyb3IgbWVzc2FnZXMuIFxuICBsZXQgZXJyb3JCdWlsZGVyID0gYnVpbGRFcnJvck1lc3NhZ2UoJ0NhcmJvbkF3YXJlQWR2aXNvcicpO1xuXG5cbiAgLyoqXG4gICogdGhpcyBmdW5jdGlvbiBpcyB0aGUgbWFpbiBmdW5jdGlvbiBvZiB0aGUgbW9kZWwsIGl0IGlzIGNhbGxlZCBieSB0aGUgaW1wbCBmaWxlXG4gICogaXQgdGFrZXMgdGhlIGlucHV0cyBmcm9tIHRoZSBpbXBsIGZpbGUgYW5kIHJldHVybnMgdGhlIHJlc3VsdHMgb2YgdGhlIG1vZGVsXG4gICogaXQgdmFsaWRhdGVzIHRoZW0gdGhhdCBhbGwgdGhlIHJlcXVpcmVkIHBhcmFtZXRlcnMgYXJlIHByb3ZpZGVkIGFuZCBhcmUgb2YgdGhlIGNvcnJlY3QgdHlwZVxuICAqIGFuZCB0aGVuIGNhbGxzIHRoZSBjYWxjdWxhdGUgZnVuY3Rpb24gdG8gcGVyZm9ybSB0aGUgYWN0dWFsIGNhbGN1bGF0aW9uc1xuICAqIEBwYXJhbSBpbnB1dHMgdGhlIGlucHV0cyBmcm9tIHRoZSBpbXBsIGZpbGVcbiAgKiBAcmV0dXJucyB0aGUgcmVzdWx0cyBvZiB0aGUgbW9kZWxcbiAgKi9cbiAgY29uc3QgZXhlY3V0ZSA9IGFzeW5jIChpbnB1dHM6IFBsdWdpblBhcmFtc1tdKSA9PiB7XG4gICAgLy8gYXdhaXQgdmFsaWRhdGVJbnB1dHMoY29uZmlncyk7XG4gICAgLy9lY2hvIHRoYXQgeW91IGFyZSBpbiB0aGUgZXhlY3V0ZSBmdW5jdGlvblxuICAgIGF3YWl0IHZhbGlkYXRlSW5wdXRzKCk7XG4gICAgY29uc29sZS5sb2coJ1lvdSBhcmUgaW4gdGhlIGV4ZWN1dGUgZnVuY3Rpb24nKTtcbiAgICAvL2NhbGwgdGhlIGNhbGN1bGF0ZSBmdW5jdGlvbiB0byBwZXJmb3JtIHRoZSBhY3R1YWwgY2FsY3VsYXRpb25zXG4gICAgcmV0dXJuIGF3YWl0IGNhbGN1bGF0ZShpbnB1dHMpO1xuICB9XG5cbiAgLyoqXG4gICogdGhpcyBpcyB0aGUgZnVuY3Rpb24gdGhhdCBwZXJmb3JtcyBhbGwgdGhlIGFwaSBjYWxscyBhbmQgcmV0dXJucyB0aGUgYWN0dWFsIHJlc3VsdHMsIFxuICAqIGl0IGlzIHRoZSBjb3JlIG9mIHRoZSBDYXJib25Bd2FyZSBBZHZpc29yIG1vZGVsIGFuZCBpdCBpcyBjYWxsZWQgYnkgdGhlIGV4ZWN1dGUgZnVuY3Rpb25cbiAgKi9cbiAgY29uc3QgY2FsY3VsYXRlID0gYXN5bmMgKGlucHV0czogUGx1Z2luUGFyYW1zW10pOiBQcm9taXNlPFBsdWdpblBhcmFtc1tdPiA9PiB7XG4gICAgLy9kZXBlbmRpbmcgb24gaWYgd2UgaGF2ZSBzYW1wbGluZyBvciBub3QgdGhlIHJlc3VsdCBtYXAgdGhhdCB3aWxsIGJlIHJldHVybmVkIHdpbGwgYmUgZGlmZmVyZW50LiBcbiAgICAvL2lmIGhhc3NhbXBsaW5nID10cnVlIHRoZW4gd2UgbmVlZCBwbG90dGVkIHBvaW50cyBhcyB3ZWxsXG5cbiAgICBsZXQgcmVzdWx0czogUGx1Z2luUGFyYW1zW10gPSBbXVxuICAgIGlmIChoYXNTYW1wbGluZykge1xuICAgICAgcmVzdWx0cyA9IGlucHV0cy5tYXAoaW5wdXQgPT4gKHtcbiAgICAgICAgLi4uaW5wdXQsXG4gICAgICAgIHN1Z2dlc3Rpb25zOiBbXSxcbiAgICAgICAgJ3Bsb3R0ZWQtcG9pbnRzJzogW11cbiAgICAgIH0pKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICByZXN1bHRzID0gaW5wdXRzLm1hcChpbnB1dCA9PiAoe1xuICAgICAgICAuLi5pbnB1dCxcbiAgICAgICAgc3VnZ2VzdGlvbnM6IFtdXG4gICAgICB9KSk7XG4gICAgfVxuICAgIC8vIGNyZWF0ZSBhbiBhcnJheSBmcm9tIHRoZSBnbG9iYWwgbG9jYXRpb25zQXJyYXkgc2V0IHRoYXQgd2FzIHBvcHVsYXRlZCBkdXJpbmcgdGhlIHZhbGlkYXRpb24gb2YgdGhlIGlucHV0c1xuICAgIGNvbnN0IGxvY2F0aW9uc0FycmF5ID0gWy4uLmFsbG93ZWRMb2NhdGlvbnNdO1xuICAgIGxldCBCZXN0RGF0YTogYW55W10gPSBbXTtcbiAgICBsZXQgcGxvdHRlZF9wb2ludHM6IGFueVtdID0gW107XG4gICAgbGV0IEFsbEJlc3REYXRhOiBhbnlbXSA9IFtdO1xuXG4gICAgLy8gV2UgZGVmaW5lIGEgbWFwIGF2ZXJhZ2VTY29yZXNCeUxvY2F0aW9uIHRvIGZpbmQgdGhlIGF2ZXJhZ2Ugc2NvcmUgZm9yIGVhY2ggbG9jYXRpb24gZm9yIHRoZSBsYXN0IGxhc3REYXlzTnVtYmVyIGRheXNcbiAgICBjb25zdCBhdmVyYWdlU2NvcmVzQnlMb2NhdGlvbjogeyBba2V5OiBzdHJpbmddOiBudW1iZXIgfCBudWxsIH0gPSB7fTtcblxuICAgIC8vIEZvciBlYWNoIGxvY2F0aW9uLCBnZXQgdGhlIGF2ZXJhZ2Ugc2NvcmUgZm9yIHRoZSBsYXN0IGxhc3REYXlzTnVtYmVyIGRheXNcbiAgICBmb3IgKGNvbnN0IGxvY2F0aW9uIG9mIGxvY2F0aW9uc0FycmF5KSB7XG4gICAgICBjb25zb2xlLmxvZyhgR2V0dGluZyBhdmVyYWdlIHNjb3JlIGZvciBsb2NhdGlvbiAke2xvY2F0aW9ufSBvdmVyIHRoZSBsYXN0ICR7bGFzdERheXNOdW1iZXJ9IGRheXNgKTtcbiAgICAgIC8vIEdldCB0aGUgYXZlcmFnZSBzY29yZSBmb3IgdGhlIGxvY2F0aW9uIGZvciBsYXN0RGF5c051bWJlciBkYXlzXG4gICAgICBjb25zdCBhdmVyYWdlU2NvcmUgPSBhd2FpdCBnZXRBdmVyYWdlU2NvcmVGb3JMYXN0WERheXMobGFzdERheXNOdW1iZXIsIGxvY2F0aW9uKTtcblxuICAgICAgLy8gU3RvcmUgdGhlIGF2ZXJhZ2Ugc2NvcmUgaW4gdGhlIGRpY3Rpb25hcnkgd2l0aCB0aGUgbG9jYXRpb24gYXMgdGhlIGtleVxuICAgICAgYXZlcmFnZVNjb3Jlc0J5TG9jYXRpb25bbG9jYXRpb25dID0gYXZlcmFnZVNjb3JlO1xuICAgIH1cblxuICAgIC8vaWYgd2UgaGF2ZSBzYW1wbGluZyB0aGVuIGNhbGN1bGF0ZSB0aGUgYWxsb2NhdGlvbnMgb2YgdGhlIHBsb3R0ZWQgcG9pbnRzIHBlciB0aW1lZnJhbWVcbiAgICBjb25zdCBhbGxvY2F0aW9uczogYW55W10gPSBoYXNTYW1wbGluZyA/IGNhbGN1bGF0ZVN1YnJhbmdlQWxsb2NhdGlvbihzYW1wbGluZykgOiBbMV07XG5cbiAgICAvL1ByaW50IHRoZSBhbGxvY2F0aW9ucyBhbmQgdGhlIGF2ZXJhZ2Ugc2NvcmVzIGJ5IGxvY2F0aW9uXG4gICAgY29uc29sZS5sb2coJ0FsbG9jYXRpb25zOicsIGFsbG9jYXRpb25zKTtcbiAgICBjb25zb2xlLmxvZyhcIkF2ZXJhZ2UgU2NvcmVzIGJ5IExvY2F0aW9uOlwiLCBhdmVyYWdlU2NvcmVzQnlMb2NhdGlvbik7XG5cbiAgICAvLyBGb3IgZWFjaCB0aW1lZnJhbWUsIGdldCB0aGUgcmVzcG9uc2UgZnJvbSB0aGUgQVBJXG4gICAgZm9yIChjb25zdCBbaW5kZXgsIHRpbWVmcmFtZV0gb2YgQXJyYXkuZnJvbShhbGxvd2VkVGltZWZyYW1lcykuZW50cmllcygpKSB7XG4gICAgICAvLyBHZXQgdGhlIGN1cnJlbnQgYWxsb2NhdGlvbiBmb3IgdGhhdCB0aW1lZnJhbWUgKGhvdyBtYW55IHBsb3R0ZWQgcG9pbnRzIHdlIG5lZWQgdG8gZXh0cmFjdCBmcm9tIHRoYXQgc3BlY2lmaWMgdGltZWZyYW1lKVxuICAgICAgY29uc3QgY3VyckFsbG9jYXRpb24gPSBhbGxvY2F0aW9uc1tpbmRleF0gLSAxO1xuICAgICAgLy9pc0ZvcmVjYXN0IGlzIGEgdmFyaWFibGUgdGVsbGluZyB1cyBpZiB0aGUgY3VycmVudCB0aW1lZnJhbWUgaXMgaW4gdGhlIGZ1dHVyZSAobWVhbmluIHRoYXQgdGhlcmUgaXMgbm8gZGF0YSBmcm9tIHRoZSBBUGkgZm9yIHRoYXQgdGltZWZyYW1lKVxuICAgICAgbGV0IGlzRm9yZWNhc3QgPSBmYWxzZTtcbiAgICAgIC8vbnVtT2ZZZWFycyBpcyBhIHZhcmlhYmxlIHRoYXQgdGVsbHMgdXMgaG93IG1hbnkgeWVhcnMgd2UgaGF2ZSBnb25lIGluIHRoZSBwYXN0IHRvIGZpbmQgZGF0YSBmb3IgdGhhdCBmb3JlY2FzdFxuICAgICAgbGV0IG51bU9mWWVhcnMgPSAwO1xuICAgICAgbGV0IG11dGFibGVUaW1lZnJhbWU6IFRpbWVmcmFtZSA9IHRpbWVmcmFtZTtcbiAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgIC8vIFByZXBhcmUgcGFyYW1ldGVycyBmb3IgdGhlIEFQSSBjYWxsXG4gICAgICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgICAgICBsb2NhdGlvbjogbG9jYXRpb25zQXJyYXksXG4gICAgICAgICAgdGltZTogbXV0YWJsZVRpbWVmcmFtZS5mcm9tLFxuICAgICAgICAgIHRvVGltZTogbXV0YWJsZVRpbWVmcmFtZS50b1xuICAgICAgICB9O1xuICAgICAgICAvL2lmIHBhcmFtcyx0aW1lIGFuZCBwYXJhbXMudG9UaW1lIGFyZSBiZWZvcmUgbm93IHdlIGRvbnQgaGF2ZSBhIGZvcmVjYXN0XG4gICAgICAgIGlmIChwYXJhbXMudGltZSA8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSAmJiBwYXJhbXMudG9UaW1lIDwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpKSB7XG5cbiAgICAgICAgICAvLyBSZXR1cm5zIGFuIGFycmF5IG9mIGFsbCBFbWlzc2lvbnNEYXRhIG9iamVjdHMgZm9yIHRoYXQgdGltZWZyYW1lIGFuZCBsb2NhdGlvbnNcbiAgICAgICAgICBsZXQgYXBpX3Jlc3BvbnNlID0gYXdhaXQgZ2V0UmVzcG9uc2UoXCIvZW1pc3Npb25zL2J5bG9jYXRpb25zXCIsICdHRVQnLCBwYXJhbXMpO1xuICAgICAgICAgIGlmIChhcGlfcmVzcG9uc2UubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYEFQSSBjYWxsIHN1Y2NlZWRlZCBmb3IgdGltZWZyYW1lIHN0YXJ0aW5nIGF0ICR7dGltZWZyYW1lLmZyb219IGApO1xuICAgICAgICAgICAgLy9pZiB0aGUgYXBpIGNhbGwgaXMgYSBmb3JlY2FzdCB0aGVuIHdlIG5lZWQgdG8gbm9ybWFsaXplIHRoZSB2YWx1ZXMgdG8gY2hhbmdlIHRoZSB5ZWFyIGFuZCB0aGUgcmF0aW5nXG4gICAgICAgICAgICAvL2ZvciBleGFtcGxlIGlmIHdlIG1hZGUgYSBmb3JlY2F0IGZvciAyMDI1IGFuZCB3ZSBhcmUgaW4gMjAyMyB0aGVuIHdlIG5lZWQgdG8gYWRqdXN0IHRoZSB5ZWFyIGJhY2sgdG8gMjAyNSBhbmQgdGhlIHJhdGluZyBiYXNlZCBvbiB0aGUgd2VpZ2h0c1xuICAgICAgICAgICAgaWYgKGlzRm9yZWNhc3QpIHtcbiAgICAgICAgICAgICAgYXBpX3Jlc3BvbnNlID0gYWRqdXN0UmF0aW5nc0FuZFllYXJzKGFwaV9yZXNwb25zZSwgbnVtT2ZZZWFycywgYXZlcmFnZVNjb3Jlc0J5TG9jYXRpb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy90aGUgbWluUmF0aW5nIGlzIHRoZSByYXRpbmcgZnJvbSB0aGUgRW1pc3Npb25zRGF0YSAgb2YgdGhlIHJlc3BvbnNlIHRoYXQgaXMgdGhlIGxvd2VzdFxuICAgICAgICAgICAgY29uc3QgbWluUmF0aW5nID0gTWF0aC5taW4oLi4uYXBpX3Jlc3BvbnNlLm1hcCgoaXRlbTogRW1pc3Npb25zRGF0YSkgPT4gaXRlbS5yYXRpbmcpKTtcblxuICAgICAgICAgICAgLy8gaGVyZSB3ZSBmaW5kIGFsbCB0aGUgRW1pc3Npb25zRGF0YSBvYmplY3RzIGZyb20gdGhlIHJlc3BvbnNlIHRoYXQgaGF2ZSB0aGUgbG93ZXN0IHJhdGluZ1xuICAgICAgICAgICAgY29uc3QgaXRlbXNXaXRoTWluUmF0aW5nID0gYXBpX3Jlc3BvbnNlLmZpbHRlcigoaXRlbTogRW1pc3Npb25zRGF0YSkgPT4gaXRlbS5yYXRpbmcgPT09IG1pblJhdGluZyk7XG5cbiAgICAgICAgICAgIC8vIFdlIHN0b3JlICB0aGF0ICBFbWlzc2lvbnNEYXRhIG9iamVjdHMgZnJvbSB0aGUgcmVzcG9uc2UgdGhhdCBoYXZlIHRoZSBsb3dlc3QgcmF0aW5nXG4gICAgICAgICAgICBCZXN0RGF0YSA9IEJlc3REYXRhLmNvbmNhdChpdGVtc1dpdGhNaW5SYXRpbmcpO1xuXG4gICAgICAgICAgICAvL2lmIHdlIGhhdmUgc2FtcGxpbmcgdGhlbiB3ZSBuZWVkIHRvIHN0b3JlIHRoZSBvbmUgKGF0IHJhbmRvbSkgb2YgdGhlIG1pbmltdW0gRW1pc3Npb25zRGF0YSBvYmplY3RzIHRvIGJlIHJldHVybmVkIGluIHRoZSBwbG90dGVkIHBvaW50c1xuICAgICAgICAgICAgY29uc3QgcmFuZG9tSW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBpdGVtc1dpdGhNaW5SYXRpbmcubGVuZ3RoKTtcbiAgICAgICAgICAgIHBsb3R0ZWRfcG9pbnRzLnB1c2goaXRlbXNXaXRoTWluUmF0aW5nW3JhbmRvbUluZGV4XSk7XG5cbiAgICAgICAgICAgIC8vIEFsbCBvZiB0aGUgRW1pc3Npb25zRGF0YSBvYmplY3RzIGZyb20gdGhlIHJlc3BvbnNlIHRoYXQgaGF2ZSB0aGUgbG93ZXN0IHJhdGluZyBhcmUgc3RvcmVkIGluIEFsbEJlc3REYXRhLCB3aGVyZSB0aGUgYmVzdCBvZiBhbGwgYXBpIGNhbGxzIHdpbGwgYmUgc3RvcmVkXG4gICAgICAgICAgICBBbGxCZXN0RGF0YSA9IFsuLi5BbGxCZXN0RGF0YSwgLi4uaXRlbXNXaXRoTWluUmF0aW5nXTtcblxuICAgICAgICAgICAgLy9pZiBoYXNTYW1wbGluZyBpcyB0cnVlICB0aGVuIHdlIG5lZWQgbW9yZSB0aGFuIHRoZSBiZXN0IHZhbHVlLCB3ZSBuZWVkIHNvbWUgZXh0cmEgdmFsdWVzIHRvIGJlIHJldHVybmVkIGluIHRoZSBwbG90dGVkIHBvaW50cyAoYXMgbWFueSBhcyB0aGUgYWxsb2NhdGlvbiBzYXlzKVxuICAgICAgICAgICAgaWYgKGhhc1NhbXBsaW5nKSB7XG4gICAgICAgICAgICAgIC8vcmVtb3ZlIGZyb20gYmVzdCBhcnJheSBhbGwgdGhlIGVsZW1lbnRzIHRoYXQgYXJlIGluIGl0ZW1zV2l0aE1pblJhdGluZywgd2UgaGF2ZSBhbHJlYWR5IHN0b3JlZCBvbmUgb2YgdGhlbVxuICAgICAgICAgICAgICBhcGlfcmVzcG9uc2UgPSBhcGlfcmVzcG9uc2UuZmlsdGVyKChpdGVtOiBFbWlzc2lvbnNEYXRhKSA9PiAhaXRlbXNXaXRoTWluUmF0aW5nLmluY2x1ZGVzKGl0ZW0pKTtcbiAgICAgICAgICAgICAgLy9zZWxlY3QgY3VyckFsbG9jYXRpb24gZWxlbW5ldHMgYXQgcmFuZG9tIGZyb20gdGhlIHJlbWFpbmluZyBpdGVtcyBpbiB0aGUgYXBpX3Jlc3BvbnNlIGFycmF5XG4gICAgICAgICAgICAgIC8vYW5kIGFkZCB0aGVtIHRvIHRoZSBwbG90dGVkX3BvaW50c1xuICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN1cnJBbGxvY2F0aW9uOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCByYW5kSW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBhcGlfcmVzcG9uc2UubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICBwbG90dGVkX3BvaW50cy5wdXNoKGFwaV9yZXNwb25zZS5zcGxpY2UocmFuZEluZGV4LCAxKVswXSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrOyAvLyBCcmVhayB0aGUgbG9vcCBpZiB3ZSBoYXZlIGZvdW5kIGRhdGEgZm9yIHRoZSBjdXJyZW50IHRpbWVmcmFtZSBhbmQgbG9jYXRpb25zIGFuZCBzZWFyY2ggZm9yIHRoZSBuZXh0IHRpbWVmcmFtZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL2lmIHdlIGhhdmUgcmVhY2hlZCB0aGlzIHBhcnQgb2YgdGhlIGNvZGUgdGhlbiB0aGF0IG1lYW5zIHRoYXQgZm9yIHRoaXMgdGltZWZyYW1lIHdlIGFyZSBmb3JlY2FzdGluZ1xuICAgICAgICBpc0ZvcmVjYXN0ID0gdHJ1ZTtcbiAgICAgICAgLy8gQWRqdXN0IHRpbWVmcmFtZSBieSBkZWNyZWFzaW5nIHRoZSB5ZWFyIGJ5IG9uZSB0byBkbyBhbiBBUEkgY2FsbCBmb3IgdGhlIHByZXZpb3VzIHllYXIgdGhlIGVueHQgdGltZVxuICAgICAgICBtdXRhYmxlVGltZWZyYW1lID0gYXdhaXQgYWRqdXN0VGltZWZyYW1lQnlPbmVZZWFyKG11dGFibGVUaW1lZnJhbWUpO1xuICAgICAgICAvL2luY3JlYXNlIHRoZSBudW1PZlllYXJzIHdlIGhhdmUgZ29uZSBpbiB0aGUgcGFzdCBieSAxXG4gICAgICAgIG51bU9mWWVhcnMrKztcbiAgICAgICAgaWYgKG51bU9mWWVhcnMgPiA1KSB7Ly8gaWYgeW91IGNhbnQgZmluZCBhbnkgZGF0YSA1IHllYXJzIGluIHRoZSBwYXN0IHRoZW4gc3RvcCBzZWFyY2hpbmdcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEluIHRoZSBBbGxCZXN0RGF0YSB3ZSBoYXZlIHRoZSBiZXN0IHZhbHVlcyBmcm9tIGFsbCB0aGUgYXBpIGNhbGxzIChzbyBmb3IgZWFjaCB0aW1lZnJhbWUpLCB3ZSBuZWVkIHRvIHJldHVybiB0aGUgYmVzdCBvZiB0aGUgYmVzdC5cbiAgICBjb25zdCBsb3dlc3RSYXRpbmcgPSBNYXRoLm1pbiguLi5BbGxCZXN0RGF0YS5tYXAoaXRlbSA9PiBpdGVtLnJhdGluZykpO1xuICAgIC8vIEZpbHRlciBhbGwgcmVzcG9uc2VzIHRvIGdldCBpdGVtcyB3aXRoIHRoZSBsb3dlc3QgcmF0aW5nIChpLmUuIHRoZSBiZXN0IHJlc3BvbnNlcylcbiAgICBjb25zdCBmaW5hbFN1Z2dlc3Rpb25zID0gQWxsQmVzdERhdGEuZmlsdGVyKGl0ZW0gPT4gaXRlbS5yYXRpbmcgPT09IGxvd2VzdFJhdGluZyk7XG5cbiAgICAvLyBTdG9yZSB0aGUgZmluYWwgc3VnZ2VzdGlvbnMgaW4gdGhlIG91dHB1dCByZXN1bHRzXG4gICAgcmVzdWx0c1swXS5zdWdnZXN0aW9ucyA9IGZpbmFsU3VnZ2VzdGlvbnM7XG5cbiAgICAvLyBJZiB3ZSBoYXZlIHNhbXBsaW5nIGluIHRoZSByZXN1bHQgd2UgcmV0dXJuIHRoZSBwbG90dGVkIHBvaW50cyBhcyB3ZWxsIHdoaWNoIGhhdmUgc2FtcGxlcyBmcm9tIGRpZmZlcmVudCB0aW1lZnJhbWUgYW5kIGxvY2F0aW9uc1xuICAgIGlmIChoYXNTYW1wbGluZykge1xuICAgICAgcmVzdWx0c1swXS5wbG90dGVkX3BvaW50cyA9IHBsb3R0ZWRfcG9pbnRzO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8qKlxuICAqIHRoaXMgZnVuY3Rpb24gYWRqdXN0cyB0aGUgcmF0aW5ncyBhbmQgeWVhcnMgb2YgdGhlIGZvcmVjYXN0ZWQgZGF0YVxuICAqIGl0IHRha2VzIHRoZSBmb3JlY2FzdGVkIGRhdGEsIHRoZSBudW1iZXIgb2YgeWVhcnMgdG8gYWRkIGFuZCB0aGUgYXZlcmFnZSBzY29yZXMgYnkgbG9jYXRpb25cbiAgKiBpdCByZXR1cm5zIHRoZSBhZGp1c3RlZCBmb3JlY2FzdGVkIGRhdGEgXG4gIEBwYXJhbSBlbWlzc2lvbnNEYXRhIFRoZSBlbWlzc2lvbnMgdGhhdCBuZWVkICB0byBiZSBhZGp1c3Rlcy5cbiAgQHBhcmFtIHllYXJzVG9BZGQgaG93IG1hbnkgeWVhcnMgaW4gdGhlIGZ1dHVyZSB0aGUgZm9yZWNhc3QgaXNcbiAgQHBhcmFtIGF2ZXJhZ2VTY29yZXNCeUxvY2F0aW9uIHRoZSBhdmVyYWdlIHNjb3JlcyBieSBsb2NhdGlvbiBmb3IgdGhlIGxhc3QgMTAgZGF5c1xuICAqL1xuICBjb25zdCBhZGp1c3RSYXRpbmdzQW5kWWVhcnMgPSAoXG4gICAgZW1pc3Npb25zRGF0YTogRW1pc3Npb25zRGF0YVtdLFxuICAgIHllYXJzVG9BZGQ6IG51bWJlcixcbiAgICBhdmVyYWdlU2NvcmVzQnlMb2NhdGlvbjogeyBba2V5OiBzdHJpbmddOiBudW1iZXIgfCBudWxsIH1cbiAgKTogRW1pc3Npb25zRGF0YVtdID0+IHtcbiAgICByZXR1cm4gZW1pc3Npb25zRGF0YS5tYXAoZGF0YSA9PiB7XG4gICAgICAvL2dldCB0aGUgYXZlcmFnZSByYXRpbmcgZm9yIHRoZSBzcGVjaWZpYyBsb2NhdGlvblxuICAgICAgY29uc3QgYXZlcmFnZVJhdGluZyA9IGF2ZXJhZ2VTY29yZXNCeUxvY2F0aW9uW2RhdGEubG9jYXRpb25dO1xuICAgICAgLy9pZiB0aGUgYXZlcmFnZSByYXRpbmcgaXMgbnVsbCB0aGVuIHdlIGRvbnQgaGF2ZSBkYXRhIGZvciB0aGUgbGFzdCAxMCBkYXlzIGZvciB0aGF0IGxvY2F0aW9uXG4gICAgICAvL2FuZCB3ZSB3aWxsIGJhc2UgdGhlIHJhdGluZyBvbmx5IG9uIHRoZSBvbGQgdmFsdWUgKG5vdCBub3JtYWxpc2UgYmFzZWQgb24gdGhlIGxhc3QgMTAgZGF5cyBhdmVyYWdlIHJhdGluZylcbiAgICAgIC8vYWRqdXN0IHRoZSByYXRpbmcgb2YgdGhpcyBsb2NhdGlvbiBiYXNlZCBvbiB0aGUgd2VpZ2h0c1xuICAgICAgY29uc3QgYWRqdXN0ZWRSYXRpbmcgPSBhdmVyYWdlUmF0aW5nICE9PSBudWxsID8gKGRhdGEucmF0aW5nICogd2VpZ2h0c1swXSArIGF2ZXJhZ2VSYXRpbmcgKiB3ZWlnaHRzWzFdKSA6IGRhdGEucmF0aW5nOyAvLyBIYW5kbGUgbnVsbCB2YWx1ZXNcbiAgICAgIC8vY3JlYXRlIHRoZSBuZXcgZGF0ZSBieSBtYWtpbmcgdGhlIHllYXIgZXF1YWwgdG8gdGhlIHllYXIgb2YgdGhlIGZvcmVjYXN0KGJ5IGFkZGluZyB0aGUgeWVhcnMgd2UgaGF2ZSBnb25lIGluIHRoZSBwYXN0KVxuICAgICAgY29uc3QgdGltZSA9IG5ldyBEYXRlKGRhdGEudGltZSk7XG4gICAgICB0aW1lLnNldEZ1bGxZZWFyKHRpbWUuZ2V0RnVsbFllYXIoKSArIHllYXJzVG9BZGQpO1xuICAgICAgLy9yZXR1cm4gdGhlIGFkanVzdGVkIGRhdGFcbiAgICAgIHJldHVybiB7IC4uLmRhdGEsIHJhdGluZzogYWRqdXN0ZWRSYXRpbmcsIHRpbWU6IHRpbWUudG9JU09TdHJpbmcoKSB9O1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkanVzdCB0aGUgdGltZWZyYW1lIGJ5IGRlY3JlYXNpbmcgdGhlIHllYXIgYnkgb25lLlxuICAgKiBAcGFyYW0gdGltZWZyYW1lIFRoZSB0aW1lZnJhbWUgdG8gYWRqdXN0LlxuICAgKiBAcmV0dXJucyBUaGUgYWRqdXN0ZWQgdGltZWZyYW1lIHdoaWNoIGlzIG9uZSB5ZWFyIGluIHRoZSBwYXN0XG4gICAqIHdlIG5lZWQgdGhpcyBmdW5jdGlvbiB0byBhZGp1c3QgdGhlIHRpbWVmcmFtZSBpZiB0aGUgdGltZWZyYW1lIGlzIGluIHRoZSBmdXR1cmUgYW5kIHdlIG5lZWQgdG8gcGVyZm9ybSBhbiBhcGkgY2FsbCBpbiB0aGUgcGFzdFxuICAgKi9cbiAgY29uc3QgYWRqdXN0VGltZWZyYW1lQnlPbmVZZWFyID0gKHRpbWVmcmFtZTogVGltZWZyYW1lKTogVGltZWZyYW1lID0+IHtcbiAgICAvLyBBZGp1c3QgdGhlIHllYXIgb2YgdGhlIHRpbWVmcmFtZSBieSBkZWNyZWFzaW5nIGl0IGJ5IG9uZVxuICAgIGNvbnN0IGFkanVzdFllYXIgPSAoZGF0ZVN0cmluZzogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShkYXRlU3RyaW5nKTtcbiAgICAgIGRhdGUuc2V0RnVsbFllYXIoZGF0ZS5nZXRGdWxsWWVhcigpIC0gMSk7XG4gICAgICByZXR1cm4gZGF0ZS50b0lTT1N0cmluZygpO1xuICAgIH07XG4gICAgLy9yZXR1cm4gdGhlIGFkanVzdGVkIHRpbWVmcmFtZSBieSBkZWNyZWFzaW5nIHRoZSB5ZWFyIGJ5IG9uZSBmb3IgdGhlIHN0YXJ0IG9mIHRoZSB0aW1lZnJhbWUgYW5kIHRoZSBlbmQgb2YgdGhlIHRpbWVmcmFtZVxuICAgIHJldHVybiB7XG4gICAgICBmcm9tOiBhZGp1c3RZZWFyKHRpbWVmcmFtZS5mcm9tKSxcbiAgICAgIHRvOiBhZGp1c3RZZWFyKHRpbWVmcmFtZS50byksXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgdGhlIHN1cHBvcnRlZCBsb2NhdGlvbnMgYmFzZWQgb24gdGhlIGxvY2F0aW9ucy5qc29uIGZpbGVcbiAgICogdGhlIHN1cHBvcnRlZCBsb2NhdGlvbnMgYXJlIHRoZSBsb2NhdGlvbnMgdGhhdCB0aGUgbW9kZWwgY2FuIHBlcmZvcm0gYXBpIGNhbGxzIGZvclxuICAgKiBidXQgYWxzbyBpbmNsdWRlIGtleSB3b3JkIHJlZ2lvbnMgKHN1Y2ggYXMgZXVyb3BlKSB0aGF0IGFyZSBzZXRzIG9mIG11bHRpcGxlIGxvY2F0aW9uc1xuICAgKi9cbiAgY29uc3Qgc2V0U3VwcG9ydGVkTG9jYXRpb25zID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgIC8vIEdldCB0aGUgbGlzdCBvZiBzdXBwb3J0ZWQgbG9jYXRpb25zIGZyb20gdGhlIGxvY2FyaW9ucy5qc29uIGZpbGVcbiAgICBjb25zdCBsb2NhbERhdGEgPSBhd2FpdCBsb2FkTG9jYXRpb25zKCk7XG4gICAgLy8gRm9yIGVhY2ggcmVnaW9uIGluIGxvY2FsRGF0YSwgIGFuZCB0aGUgbG9jYXRpb25zIG9mIHRoYXQgcmVnaW9uIHRvIHRoZSBzZXQgb2Ygc3VwcG9ydGVkIGxvY2F0aW9uc1xuICAgIE9iamVjdC5rZXlzKGxvY2FsRGF0YSkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgY29uc3QgbG9jYXRpb25zQXJyYXkgPSBsb2NhbERhdGFba2V5XTtcbiAgICAgIGxvY2F0aW9uc0FycmF5LmZvckVhY2goKGxvY2F0aW9uOiBzdHJpbmcpID0+IHtcbiAgICAgICAgLy8gQWRkIGVhY2ggc2VydmVyIHRvIHRoZSBzZXQgb2Ygc3VwcG9ydGVkIGxvY2F0aW9uc1xuICAgICAgICBzdXBwb3J0ZWRMb2NhdGlvbnMuYWRkKGxvY2F0aW9uKTtcbiAgICAgIH0pO1xuICAgICAgLy8gQWRkIGVhY2ggcmVnaW9uIGl0c2VsZiB0byB0aGUgc2V0IG9mIHN1cHBvcnRlZCBsb2NhdGlvbnNcbiAgICAgIHN1cHBvcnRlZExvY2F0aW9ucy5hZGQoa2V5KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZW5kIGEgcmVxdWVzdCB0byB0aGUgY2FyYm9uLWF3YXJlLXNkayBBUEkuXG4gICAqIEBwYXJhbSByb3V0ZSBUaGUgcm91dGUgdG8gc2VuZCB0aGUgcmVxdWVzdCB0by4gV2UgbW9zdGx5IHVzZSAnL2VtaXNzaW9ucy9ieWxvY2F0aW9ucycgdG8gZ2V0IHRoZSBlbWlzc2lvbnMgZGF0YVxuICAgKiBAcGFyYW0gbWV0aG9kIFRoZSBIVFRQIG1ldGhvZCB0byB1c2UuXG4gICAqIEBwYXJhbSBwYXJhbXMgVGhlIG1hcCBvZiBwYXJhbWV0ZXJzIHRvIHNlbmQgd2l0aCB0aGUgcmVxdWVzdC5cbiAgICogQHJldHVybnMgVGhlIHJlc3BvbnNlIGZyb20gdGhlIEFQSSBvZiBhbnkgdHlwZS5cbiAgICogQHRocm93cyBFcnJvciBpZiB0aGUgcmVxdWVzdCBmYWlscyBhbmQgc3RvcHMgdGhlIGV4ZWN1dGlvbiBvZiB0aGUgbW9kZWwuXG4gICAqL1xuICBjb25zdCBnZXRSZXNwb25zZSA9IGFzeW5jIChyb3V0ZTogc3RyaW5nLCBtZXRob2Q6IHN0cmluZyA9ICdHRVQnLCBwYXJhbXM6IGFueSA9IG51bGwpOiBQcm9taXNlPGFueT4gPT4ge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwoYCR7QVBJX1VSTH0ke3JvdXRlfWApO1xuXG4gICAgLy8gTWFudWFsbHkgc2VyaWFsaXplIHBhcmFtcyB0byBtYXRjaCB0aGUgcmVxdWlyZWQgZm9ybWF0OiAnbG9jYXRpb249ZWFzdHVzJmxvY2F0aW9uPXdlc3R1cyYuLi4nXG4gICAgbGV0IHF1ZXJ5U3RyaW5nID0gJyc7XG4gICAgaWYgKHBhcmFtcykge1xuICAgICAgcXVlcnlTdHJpbmcgPSBPYmplY3QuZW50cmllcyhwYXJhbXMpLm1hcCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgIC8vIENvbnZlcnQgZWFjaCB2YWx1ZSB0byBhIHN0cmluZyBiZWZvcmUgZW5jb2RpbmcgYW5kIHJlcGVhdCB0aGUga2V5IGZvciBlYWNoIHZhbHVlIGluIHRoZSBhcnJheVxuICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAodiA9PiBgJHtlbmNvZGVVUklDb21wb25lbnQoa2V5KX09JHtlbmNvZGVVUklDb21wb25lbnQoU3RyaW5nKHYpKX1gKS5qb2luKCcmJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gQ29udmVydCB2YWx1ZSB0byBhIHN0cmluZyBiZWZvcmUgZW5jb2RpbmcgYW5kIGRpcmVjdGx5IGFwcGVuZCB0byBxdWVyeSBzdHJpbmdcbiAgICAgICAgICByZXR1cm4gYCR7ZW5jb2RlVVJJQ29tcG9uZW50KGtleSl9PSR7ZW5jb2RlVVJJQ29tcG9uZW50KFN0cmluZyh2YWx1ZSkpfWA7XG4gICAgICAgIH1cbiAgICAgIH0pLmpvaW4oJyYnKTtcbiAgICB9XG4gICAgLy90aGUgZmluYWwgdXJsIGlzIHRoZSB1cmwgb2YgdGhlIGFwaSBjYWxsIHdlIHdpbGwgYmUgcGVyZm9ybWluZ1xuICAgIGNvbnN0IGZpbmFsVXJsID0gYCR7dXJsfSR7cXVlcnlTdHJpbmcgPyAnPycgKyBxdWVyeVN0cmluZyA6ICcnfWA7XG4gICAgY29uc29sZS5sb2coYFNlbmRpbmcgJHttZXRob2R9IHJlcXVlc3QgdG8gJHtmaW5hbFVybH1gKTtcblxuICAgIGxldCBhdHRlbXB0cyA9IDA7XG4gICAgY29uc3QgbWF4QXR0ZW1wdHMgPSAzOyAvLyBJbml0aWFsIGF0dGVtcHQgKyAyIHJldHJpZXMgaWYgd2UgZ2V0IGVycm9yIDUwMCBmcm9tIHRoZSBBUElcblxuICAgIHdoaWxlIChhdHRlbXB0cyA8IG1heEF0dGVtcHRzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGF4aW9zKHtcbiAgICAgICAgICB1cmw6IGZpbmFsVXJsLFxuICAgICAgICAgIG1ldGhvZDogbWV0aG9kLFxuICAgICAgICB9KTtcbiAgICAgICAgLy9pZiB0aGUgYXBpIGNhbGwgaXMgc3VjY2Vzc2Z1bCB0aGVuIHJldHVybiB0aGUgZGF0YVxuICAgICAgICByZXR1cm4gcmVzcG9uc2UuZGF0YTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIC8vaWYgd2UgZ2V0IGFuIGVycm9yIGZyb20gdGhlIGFwaVxuICAgICAgICBhdHRlbXB0cysrO1xuXG4gICAgICAgIC8vIFVzZSBhIHR5cGUgZ3VhcmQgdG8gY2hlY2sgaWYgdGhlIGVycm9yIGlzIGFuIEF4aW9zRXJyb3JcbiAgICAgICAgaWYgKGF4aW9zLmlzQXhpb3NFcnJvcihlcnJvcikpIHtcbiAgICAgICAgICBjb25zdCBheGlvc0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihheGlvc0Vycm9yLm1lc3NhZ2UpO1xuICAgICAgICAgIC8vaWYgd2UgZ2V0IGVycm9yIDUwMCB0aGVuIHJldHJ5IHRoZSBhcGkgY2FsbCB1cCB0byAyIG1vcmUgdGltZXNcbiAgICAgICAgICBpZiAoYXhpb3NFcnJvci5yZXNwb25zZSAmJiBheGlvc0Vycm9yLnJlc3BvbnNlLnN0YXR1cyA9PT0gNTAwICYmIGF0dGVtcHRzIDwgbWF4QXR0ZW1wdHMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBBdHRlbXB0ICR7YXR0ZW1wdHN9IGZhaWxlZCB3aXRoIHN0YXR1cyA1MDAuIFJldHJ5aW5nLi4uYCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKClcbiAgICAgICAgICAgIHRocm93RXJyb3IoRXJyb3IsIGF4aW9zRXJyb3IubWVzc2FnZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIElmIGl0J3Mgbm90IGFuIEF4aW9zRXJyb3IsIGl0IG1pZ2h0IGJlIHNvbWUgb3RoZXIgZXJyb3IgKGxpa2UgYSBuZXR3b3JrIGVycm9yLCBldGMuKVxuICAgICAgICAgIHRocm93RXJyb3IoRXJyb3IsICdBbiB1bmV4cGVjdGVkIGVycm9yIG9jY3VycmVkJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlIHRoZSBpbnB1dHMgcHJvdmlkZWQgYnkgdGhlIHVzZXIgdG8gbWFrZSBzdXJlIHRoYXQgYWxsIHJlcXVpcmVkIHBhcmFtZXRlcnMgYXJlIHByb3ZpZGVkIGFuZCBhcmUgb2YgdGhlIGNvcnJlY3QgdHlwZS5cbiAgICogQHBhcmFtIGlucHV0cyBUaGUgaW5wdXRzIHByb3ZpZGVkIGJ5IHRoZSB1c2VyLlxuICAgKiBAdGhyb3dzIElucHV0VmFsaWRhdGlvbkVycm9yIGlmIHRoZSBpbnB1dHMgYXJlIGludmFsaWQgYW5kIHN0b3BzIHRoZSBleGVjdXRpb24gb2YgdGhlIG1vZGVsLlxuICAgKi9cbiAgY29uc3QgdmFsaWRhdGVJbnB1dHMgPSBhc3luYyAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coJ0lucHV0IHZhbGlkYXRpb246ICcsIEpTT04uc3RyaW5naWZ5KHBhcmFtcywgbnVsbCwgMikpO1xuICAgIGlmIChwYXJhbXMgPT09IHVuZGVmaW5lZCB8fCBwYXJhbXMgPT09IG51bGwgfHwgT2JqZWN0LmtleXMocGFyYW1zKS5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93RXJyb3IoSW5wdXRWYWxpZGF0aW9uRXJyb3IsICdSZXF1aXJlZCBQYXJhbWV0ZXJzIG5vdCBwcm92aWRlZCcpO1xuICAgIH1cblxuICAgIGF3YWl0IHNldFN1cHBvcnRlZExvY2F0aW9ucygpOyAvLyBTZXQgdGhlIHN1cHBvcnRlZCBsb2NhdGlvbnMgYmFzZWQgb24gdGhlIGxvY2F0aW9ucy5qc29uIGZpbGUgdG8gc2VlIGlmIHRoZSBsb2NhdGlvbnMgd2UgZ290IGFzIGlucHV0cyBhcmUgYW1vbmcgdGhlbVxuICAgIHZhbGlkYXRlUGFyYW1zKCk7IC8vIFZhbGlkYXRlIHBhcmFtc1xuICAgIGNvbnNvbGUubG9nKCdWYWxpZGF0aW9uIGNvbXBsZXRlLicpXG4gIH07XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlIHRoZSBpbnB1dHMgcHJvdmlkZWQgYnkgdGhlIHVzZXIgdG8gbWFrZSBzdXJlIHRoYXQgYWxsIHJlcXVpcmVkIHBhcmFtZXRlcnMgYXJlIHByb3ZpZGVkIGFuZCBhcmUgb2YgdGhlIGNvcnJlY3QgdHlwZS5cbiAgICogSGVyZSB3ZSBhcmUgc3VyZSB0aGF0IHNvbWUgaW5wdXRzIGhhdmUgYmVlbiBwcm92aWRlZCBhbmQgd2UgaGF2ZSBzZXQgdGhlIHN1cHBvcnRlZCBsb2NhdGlvbnNcbiAgICogQHBhcmFtIHBhcmFtcyBUaGUgaW5wdXRzIHByb3ZpZGVkIGJ5IHRoZSB1c2VyIGluIHRoZSBpbXBsIGZpbGVcbiAgICogQHRocm93cyBJbnB1dFZhbGlkYXRpb25FcnJvciBpZiB0aGUgaW5wdXRzIGFyZSBpbnZhbGlkIGFuZCBzdG9wcyB0aGUgZXhlY3V0aW9uIG9mIHRoZSBtb2RlbC5cbiAgICovXG4gIGNvbnN0IHZhbGlkYXRlUGFyYW1zID0gKCkgPT4ge1xuICAgIC8vcHJpbnQgdGhlIHBhcmFtcyByZWNlaXZlZCBmcm9tIHRoZSBpbXBsIGZpbGUgZm9yIGRlYnVnZ2luZyBwdXByb3Nlc1xuICAgIC8vY29uc29sZS5sb2coXCJUaGUgcGFyYW1zIHJlY2VpdmVkIGZyb20gdGhlIGltcGw6XCIsSlNPTi5zdHJpbmdpZnkocGFyYW1zKSk7XG5cbiAgICAvLyBDaGVjayBpZiB0aGUgJ2FsbG93ZWQtbG9jYXRpb25zJyBwcm9wZXJ0eSBleGlzdHMgaW4gdGhlIGltcGwgZmlsZVxuICAgIGlmIChwYXJhbXMgJiYgcGFyYW1zWydhbGxvd2VkLWxvY2F0aW9ucyddICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IGxvY3MgPSBwYXJhbXNbJ2FsbG93ZWQtbG9jYXRpb25zJ107XG4gICAgICAvLyB2YWxpZGF0ZSB0aGF0IHRoZSBsb2NhdGlvbnMgYXJlIGNvcmVjdFxuICAgICAgdmFsaWRhdGVMb2NhdGlvbnMobG9jcyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdGhyb3dFcnJvcihJbnB1dFZhbGlkYXRpb25FcnJvciwgYFJlcXVpcmVkIFBhcmFtZXRlciBhbGxvd2VkLWxvY2F0aW9ucyBub3QgcHJvdmlkZWRgKTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgaWYgdGhlICdhbGxvd2VkLXRpbWVmcmFtZXMnIHByb3BlcnR5IGV4aXN0cyBpbiB0aGUgaW1wbCBmaWxlXG4gICAgaWYgKHBhcmFtcyAmJiBwYXJhbXNbJ2FsbG93ZWQtdGltZWZyYW1lcyddICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHRpbWVzID0gcGFyYW1zWydhbGxvd2VkLXRpbWVmcmFtZXMnXTtcbiAgICAgIC8vIHZhbGlkYXRlIHRoYXQgdGhlIHRpbWVmcmFtZXMgYXJlIGNvcnJlY3RcbiAgICAgIHZhbGlkYXRlVGltZWZyYW1lcyh0aW1lcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93RXJyb3IoSW5wdXRWYWxpZGF0aW9uRXJyb3IsIGBSZXF1aXJlZCBQYXJhbWV0ZXIgYWxsb3dlZC10aW1lZnJhbWVzIG5vdCBwcm92aWRlZGApO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZSAnc2FtcGxpbmcnIHByb3BlcnR5IGV4aXN0cyBpbiB0aGUgaW1wbCBmaWxlXG4gICAgaWYgKHBhcmFtcyAmJiBwYXJhbXNbJ3NhbXBsaW5nJ10gIT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc3Qgc2FtcGxlID0gcGFyYW1zWydzYW1wbGluZyddO1xuICAgICAgLy8gRnVydGhlciBwcm9jZXNzaW5nIHdpdGggbG9jc1xuICAgICAgY29uc29sZS5sb2coJ2BzYW1wbGluZ2AgcHJvdmlkZWQ6Jywgc2FtcGxlKTtcbiAgICAgIHZhbGlkYXRlU2FtcGxpbmcoc2FtcGxlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ1NhbXBsaW5nIG5vdCBwcm92aWRlZCwgaWdub3JpbmcnKTtcbiAgICB9XG4gIH07XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlIHRoZSBzYW1wbGluZyBwYXJhbWV0ZXIgdG8gbWFrZSBzdXJlIHRoYXQgaXQgaXMgYSBwb3NpdGl2ZSBudW1iZXIuXG4gICAqIEBwYXJhbSBzYW1wbGluZyBUaGUgc2FtcGxpbmcgcGFyYW1ldGVyIHByb3ZpZGVkIGJ5IHRoZSB1c2VyLlxuICAgKiBAdGhyb3dzIElucHV0VmFsaWRhdGlvbkVycm9yIGlmIHRoZSBzYW1wbGluZyBwYXJhbWV0ZXIgaXMgaW52YWxpZCBhbmQgc3RvcHMgdGhlIGV4ZWN1dGlvbiBvZiB0aGUgbW9kZWwuXG4gICAqIEByZXR1cm5zIHZvaWRcbiAgICovXG4gIGNvbnN0IHZhbGlkYXRlU2FtcGxpbmcgPSAoc2FtcGxlOiBhbnkpOiB2b2lkID0+IHtcbiAgICAvLyBDaGVjayBpZiBzYW1wbGluZyBpcyBhIHBvc2l0aXZlIG51bWJlciAgYW5kIHBvcHVsYXRlIHRoZSBnbG9iYWwgcGFyYW1zIGhhc1NhbXBsaW5nIGFuZCBzYW1wbGluZ1xuICAgIGhhc1NhbXBsaW5nID0gc2FtcGxlID4gMDtcbiAgICBzYW1wbGluZyA9IHNhbXBsZTtcblxuICAgIGlmICghaGFzU2FtcGxpbmcgfHwgdHlwZW9mIHNhbXBsaW5nICE9PSAnbnVtYmVyJyB8fCBzYW1wbGluZyA8PSAwKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ2BzYW1wbGluZ2AgcHJvdmlkZWQgYnV0IG5vdCBhIHBvc2l0aXZlIG51bWJlci4gSWdub3JpbmcgYHNhbXBsaW5nYC4nKTtcbiAgICB9XG4gIH07XG5cbiAgLyoqXG4gICogVmFsaWRhdGUgdGhlIGFsbG93ZWQtbG9jYXRpb25zIHBhcmFtZXRlciB0byBtYWtlIHN1cmUgdGhhdCBpdCBpcyBhbiBhcnJheSBvZiBsb2NhdGlvbnNcbiAgKiBhbmQgdGhhdCB0aG9zZSBsb2NhdGlvbnMgYXJlIHN1cHBvcnRlZFxuICAqIEBwYXJhbSBsb2NzIFRoZSBhcnJheSBvZiBhbGxvd2VkIGxvY2F0aW9ucyBwcm92aWRlZCBieSB0aGUgdXNlciBpbiB0aGUgaW1wbFxuICAqIEB0aHJvd3MgSW5wdXRWYWxpZGF0aW9uRXJyb3IgaWYgdGhlIGFsbG93ZWQgbG9jYXRpb25zIHBhcmFtZXRlciBpcyBpbnZhbGlkIG9yIHNvbWUgb2YgdGhlIGxvY2F0aW9ucyBhcmUgdW5zdXBwb3J0ZWQgYW5kIHN0b3BzIHRoZSBleGVjdXRpb24gb2YgdGhlIG1vZGVsLlxuICAqIEByZXR1cm5zIHZvaWRcbiAgKi9cbiAgY29uc3QgdmFsaWRhdGVMb2NhdGlvbnMgPSAobG9jczogYW55KTogdm9pZCA9PiB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGxvY3MpIHx8IGxvY3MubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvd0Vycm9yKElucHV0VmFsaWRhdGlvbkVycm9yLCBgUmVxdWlyZWQgUGFyYW1ldGVyICdhbGxvd2VkLWxvY2F0aW9ucycgaXMgZW1wdHlgKTtcbiAgICB9XG5cbiAgICBsb2NzLmZvckVhY2goKGxvY2F0aW9uOiBzdHJpbmcpID0+IHtcbiAgICAgIC8vY2hlY2sgdGhhdCB0aGUgbG9jYXRpb25zIGluIHRoZSBpbXBsIGFyZSBzb21lIG9mIHRoZSBzdXBwb3J0ZWQgbG9jYXRpb25zXG4gICAgICBpZiAoIXN1cHBvcnRlZExvY2F0aW9ucy5oYXMobG9jYXRpb24pKSB7XG4gICAgICAgIHRocm93RXJyb3IoSW5wdXRWYWxpZGF0aW9uRXJyb3IsIGBMb2NhdGlvbiAke2xvY2F0aW9ufSBpcyBub3Qgc3VwcG9ydGVkYCk7XG4gICAgICB9XG4gICAgICBhbGxvd2VkTG9jYXRpb25zLmFkZChsb2NhdGlvbik7IC8vIHBvcHVsYXRlIHRoZSBnbG9iYWwgc2V0IG9mIGFsbG93ZWRMb2NhdGlvbnNcbiAgICB9KTtcbiAgfTtcblxuICAvKipcbiAgKiBWYWxpZGF0ZSB0aGUgYWxsb3dlZC10aW1lZnJhbWVzIHBhcmFtZXRlciB0byBtYWtlIHN1cmUgdGhhdCBpdCBpcyBhbiBhcnJheSBvZiB0aW1lZnJhbWVzXG4gICogYW5kIHRoYXQgdGhvc2UgdGltZWZyYW1lcyBhcmUgdmFsaWRcbiAgKiBAcGFyYW0gdGltZWZyYW1lcyBUaGUgYXJyYXkgb2YgYWxsb3dlZCB0aW1lZnJhbWVzIHByb3ZpZGVkIGJ5IHRoZSB1c2VyIGluIHRoZSBpbXBsXG4gICogQHRocm93cyBJbnB1dFZhbGlkYXRpb25FcnJvciBpZiB0aGUgYWxsb3dlZCB0aW1lZnJhbWVzIHBhcmFtZXRlciBpcyBpbnZhbGlkIG9yIHNvbWUgb2YgdGhlIHRpbWVmcmFtZXMgYXJlIGludmFsaWQgYW5kIHN0b3BzIHRoZSBleGVjdXRpb24gb2YgdGhlIG1vZGVsLlxuICAqIEByZXR1cm5zIHZvaWRcbiAgKi9cbiAgY29uc3QgdmFsaWRhdGVUaW1lZnJhbWVzID0gKHRpbWVmcmFtZXM6IGFueSk6IHZvaWQgPT4ge1xuICAgIGlmICghQXJyYXkuaXNBcnJheSh0aW1lZnJhbWVzKSB8fCB0aW1lZnJhbWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3dFcnJvcihJbnB1dFZhbGlkYXRpb25FcnJvcixcbiAgICAgICAgYFJlcXVpcmVkIFBhcmFtZXRlciBhbGxvd2VkLXRpbWVmcmFtZXMgaXMgZW1wdHlgKTtcbiAgICB9XG5cbiAgICAvLyBGb3IgZWFjaCB0aW1lZnJhbWUgcHJvdmlkZWQsIGNoZWNrIGlmIGl0IGlzIHZhbGlkIGFuZCBhZGQgaXQgdG8gdGhlIHNldCBvZiBhbGxvd2VkIHRpbWVmcmFtZXNcbiAgICB0aW1lZnJhbWVzLmZvckVhY2goKHRpbWVmcmFtZTogc3RyaW5nKSA9PiB7XG4gICAgICAvLyBGb3IgZWFjaCB0aW1lZnJhbWUgcHJvdmlkZWQsIGNoZWNrIGlmIGl0IGlzIHZhbGlkXG4gICAgICBjb25zdCBbZnJvbSwgdG9dID0gdGltZWZyYW1lLnNwbGl0KCcgLSAnKTtcbiAgICAgIGlmIChmcm9tID09PSB1bmRlZmluZWQgfHwgdG8gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvd0Vycm9yKElucHV0VmFsaWRhdGlvbkVycm9yLFxuICAgICAgICAgIGBUaW1lZnJhbWUgJHt0aW1lZnJhbWV9IGlzIGludmFsaWRgKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgaWYgdGhlIHN0YXJ0IGFuZCBlbmQgdGltZXMgYXJlIHZhbGlkIGRhdGVzXG4gICAgICBpZiAoaXNOYU4oRGF0ZS5wYXJzZShmcm9tKSkgfHwgaXNOYU4oRGF0ZS5wYXJzZSh0bykpKSB7XG4gICAgICAgIHRocm93RXJyb3IoSW5wdXRWYWxpZGF0aW9uRXJyb3IsXG4gICAgICAgICAgYFRpbWVmcmFtZSAke3RpbWVmcmFtZX0gaXMgaW52YWxpZGApO1xuICAgICAgfVxuXG4gICAgICAvLyBDaGVjayBpZiBzdGFydCBpcyBiZWZvcmUgZW5kXG4gICAgICBpZiAoZnJvbSA+PSB0bykge1xuICAgICAgICB0aHJvd0Vycm9yKElucHV0VmFsaWRhdGlvbkVycm9yLFxuICAgICAgICAgIGBTdGFydCB0aW1lICR7ZnJvbX0gbXVzdCBiZSBiZWZvcmUgZW5kIHRpbWUgJHt0b31gKTtcbiAgICAgIH1cbiAgICAgIGFsbG93ZWRUaW1lZnJhbWVzLmFkZCh7ICAvL2FkZCB0aGlzIHZhbGlkIHRpbWVmcmFtZSB0byB0aGUgZ2xvYmFsIHNldCBhbGxvd2VkVGltZWZyYW1lc1xuICAgICAgICBmcm9tOiBmcm9tLFxuICAgICAgICB0bzogdG9cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIHRoaXMgZnVuY3Rpb24gY2FsY3VsYXRlcyB0aGUgYWxsb2NhdGlvbiBvZiB0aGUgc2FtcGxlcyB0byB0aGUgdGltZWZyYW1lc1xuICAgKiB0aGVyZSBtdXN0IGJlIGF0IGxlYXN0IG9uZSBzYW1wbGUgcGVyIHRpbWVmcmFtZVxuICAgKiBpZiBzYW1wbGVzIDwgbnVtYmVyIG9mIHRpbWVmcmFtZXMgdGhlbiBhbiBlcnJvciBpcyB0aHJvd25cbiAgICogQHBhcmFtIHNhbXBsaW5nIHRoZSBudW1iZXIgb2Ygc2FtcGxlcyBuZWVkZWRcbiAgICogQHJldHVybnMgdGhlIGFsbG9jYXRpb24gb2YgdGhlIHNhbXBsZXMgdG8gdGhlIHRpbWVmcmFtZXMgbWVhbmluZyBob3cgbWFueSBzYW1wbGVzIHdlIG11c3Qgc2VsZWN0IGZyb20gZWFjaCB0aW1lZnJhbWUgXG4gICAqIGluIG9yZGVyIHRvIGhhdmUgYSB1bmlmcm9tIGRpc3RyaWJ1dGlvbiBvZiB0aGUgc2FtcGxlcyBcbiAgICogKGZvciBleGFtcGxlIGlmIG9uZSB0aW1lZnJhbWUgaXMgdmVyeSBsb25nIHdlIHdpbGwgc2VsZWN0IG1vcmUgc2FtcGxlcyBmcm9tIGl0IHRoYW4gZnJvbSBhIHNob3J0ZXIgdGltZWZyYW1lKVxuICAgKi9cbiAgY29uc3QgY2FsY3VsYXRlU3VicmFuZ2VBbGxvY2F0aW9uID0gKHNhbXBsaW5nOiBudW1iZXIpID0+IHtcbiAgICAvL2lmIHNhbXBsZXMgPCBudW1iZXIgb2YgdGltZWZyYW1lcyB0aGVuIGFuIGVycm9yIGlzIHRocm93blxuICAgIGNvbnN0IHRpbWVmcmFtZXNDb3VudCA9IGFsbG93ZWRUaW1lZnJhbWVzLnNpemU7XG4gICAgaWYgKHNhbXBsaW5nIDwgdGltZWZyYW1lc0NvdW50KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTYW1wbGluZyBudW1iZXIgdG9vIHNtYWxsIGZvciB0aGUgbnVtYmVyIG9mIHRpbWVmcmFtZXMuXCIpO1xuICAgIH1cblxuICAgIC8vcmV0dXJucyB0aGUgZHVyYXRpb24gb2YgZWFjaCB0aW1lZnJhbWVcbiAgICBjb25zdCBkdXJhdGlvbnMgPSBBcnJheS5mcm9tKGFsbG93ZWRUaW1lZnJhbWVzKS5tYXAodGltZWZyYW1lID0+IHtcbiAgICAgIGNvbnN0IHN0YXJ0ID0gbmV3IERhdGUodGltZWZyYW1lLmZyb20pLmdldFRpbWUoKTtcbiAgICAgIGNvbnN0IGVuZCA9IG5ldyBEYXRlKHRpbWVmcmFtZS50bykuZ2V0VGltZSgpO1xuICAgICAgcmV0dXJuIChlbmQgLSBzdGFydCkgLyAxMDAwOyAvLyBEdXJhdGlvbiBpbiBzZWNvbmRzXG4gICAgfSk7XG5cbiAgICAvL3RoZSB0b3RhbCBkdXJhdGlvbiBpcyB0aGUgc3VtIG9mIGFsbCB0aGUgZHVyYXRpb25zXG4gICAgY29uc3QgdG90YWxEdXJhdGlvbiA9IGR1cmF0aW9ucy5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKTtcblxuICAgIC8vIEluaXRpYWwgYWxsb2NhdGlvbiBvZiAxIHNhbXBsZSBwZXIgdGltZWZyYW1lXG4gICAgbGV0IGFsbG9jYXRpb25zID0gZHVyYXRpb25zLm1hcChfID0+IDEpO1xuICAgIGxldCByZW1haW5pbmdTYW1wbGVzID0gc2FtcGxpbmcgLSB0aW1lZnJhbWVzQ291bnQ7IC8vIEFkanVzdCByZW1haW5pbmcgc2FtcGxlc1xuXG4gICAgLy8gUHJvcG9ydGlvbmFsIGFsbG9jYXRpb24gb2YgdGhlIHJlbWFpbmluZyBzYW1wbGVzXG4gICAgaWYgKHRvdGFsRHVyYXRpb24gPiAwKSB7XG4gICAgICBjb25zdCByZW1haW5pbmdEdXJhdGlvbnMgPSBkdXJhdGlvbnMubWFwKGR1cmF0aW9uID0+IGR1cmF0aW9uIC8gdG90YWxEdXJhdGlvbiAqIHJlbWFpbmluZ1NhbXBsZXMpO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhbGxvY2F0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBhbGxvY2F0aW9uc1tpXSArPSBNYXRoLnJvdW5kKHJlbWFpbmluZ0R1cmF0aW9uc1tpXSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVkaXN0cmlidXRpb24gdG8gZW5zdXJlIHRvdGFsIG1hdGNoZXMgc2FtcGxpbmdcbiAgICBsZXQgdG90YWxBbGxvY2F0ZWQgPSBhbGxvY2F0aW9ucy5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKTtcbiAgICB3aGlsZSAodG90YWxBbGxvY2F0ZWQgIT09IHNhbXBsaW5nKSB7XG4gICAgICBpZiAodG90YWxBbGxvY2F0ZWQgPiBzYW1wbGluZykge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFsbG9jYXRpb25zLmxlbmd0aCAmJiB0b3RhbEFsbG9jYXRlZCA+IHNhbXBsaW5nOyBpKyspIHtcbiAgICAgICAgICBpZiAoYWxsb2NhdGlvbnNbaV0gPiAxKSB7XG4gICAgICAgICAgICBhbGxvY2F0aW9uc1tpXSAtPSAxO1xuICAgICAgICAgICAgdG90YWxBbGxvY2F0ZWQgLT0gMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWxsb2NhdGlvbnMubGVuZ3RoICYmIHRvdGFsQWxsb2NhdGVkIDwgc2FtcGxpbmc7IGkrKykge1xuICAgICAgICAgIGFsbG9jYXRpb25zW2ldICs9IDE7XG4gICAgICAgICAgdG90YWxBbGxvY2F0ZWQgKz0gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBhbGxvY2F0aW9ucztcbiAgfVxuXG4gIC8qKlxuICAgKiB0aGlzIGZ1bmN0aW9uIHRocm93cyBhbiBlcnJvciBvZiBhIHNwZWNpZmljIHR5cGUgYW5kIG1lc3NhZ2VcbiAgICogQHBhcmFtIHR5cGUgdGhlIHR5cGUgb2YgdGhlIGVycm9yXG4gICAqIEBwYXJhbSBtZXNzYWdlIHRoZSBtZXNzYWdlIG9mIHRoZSBlcnJvclxuICAgKiBAdGhyb3dzIHRoZSBlcnJvciBvZiB0aGUgc3BlY2lmaWMgdHlwZSBhbmQgbWVzc2FnZVxuICAgKiBAcmV0dXJucyB2b2lkXG4gICAqL1xuICBjb25zdCB0aHJvd0Vycm9yID0gKHR5cGU6IEVycm9yQ29uc3RydWN0b3IsIG1lc3NhZ2U6IHN0cmluZykgPT4ge1xuICAgIHRocm93IG5ldyB0eXBlKGVycm9yQnVpbGRlcih7IG1lc3NhZ2UgfSkpO1xuICB9XG5cbiAgLyoqXG4gICAqIHRoaXMgZnVuY3Rpb24gbG9hZHMgdGhlIGxvY2F0aW9ucyBmcm9tIHRoZSBsb2NhdGlvbnMuanNvbiBmaWxlXG4gICAqIEByZXR1cm5zIHRoZSBsb2NhdGlvbnMgb2JqZWN0IGZyb20gdGhlIGxvY2F0aW9ucy5qc29uIGZpbGVcbiAgICovXG4gIGNvbnN0IGxvYWRMb2NhdGlvbnMgPSBhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIC8vZ2V0IHRoZSBkYXRhIGZyb20gdGhlIGxvY2F0aW9ucy5qc29uIGZpbGVcbiAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCBmc1Byb21pc2VzLnJlYWRGaWxlKGxvY2F0aW9uc0ZpbGVQYXRoLCAndXRmLTgnKTtcbiAgICAgIGNvbnN0IGxvY2F0aW9uc09iamVjdCA9IEpTT04ucGFyc2UoZGF0YSk7XG4gICAgICByZXR1cm4gbG9jYXRpb25zT2JqZWN0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gcmVhZCBmcm9tIGxvY2F0aW9ucy5qc29uLiBQbGVhc2UgY2hlY2sgdGhlIGZpbGUgYW5kIGl0cyBwYXRoIGFuZCB0cnkgYWdhaW4uXCIpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAqIENhbGN1bGF0ZXMgdGhlIGF2ZXJhZ2Ugc2NvcmUgZm9yIGEgZ2l2ZW4gbG9jYXRpb24gb3ZlciB0aGUgbGFzdCBkYXlzIGRheXMuXG4gICogXG4gICogQHBhcmFtIGRheXMgVGhlIG51bWJlciBvZiBkYXlzIHRvIGxvb2sgYmFjayBmcm9tIHRoZSBjdXJyZW50IGRhdGUuXG4gICogQHBhcmFtIGxvY2F0aW9uIFRoZSBsb2NhdGlvbiBmb3Igd2hpY2ggdG8gY2FsY3VsYXRlIHRoZSBhdmVyYWdlIHNjb3JlLlxuICAqIEByZXR1cm5zIFRoZSBhdmVyYWdlIHNjb3JlIGZvciB0aGUgc3BlY2lmaWVkIGxvY2F0aW9uIG92ZXIgdGhlIGxhc3QgZGF5cyBkYXlzLlxuICAqL1xuICBjb25zdCBnZXRBdmVyYWdlU2NvcmVGb3JMYXN0WERheXMgPSBhc3luYyAoZGF5czogbnVtYmVyLCBsb2NhdGlvbjogc3RyaW5nKTogUHJvbWlzZTxudW1iZXIgfCBudWxsPiA9PiB7XG4gICAgLy8gQ2FsY3VsYXRlIHRoZSBzdGFydCBkYXRlIGJ5IHN1YnRyYWN0aW5nIGRheXMgbnVtYmVyIG9mIGRheXMgZnJvbSB0aGUgY3VycmVudCBkYXRlXG4gICAgY29uc3QgdG9UaW1lID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCB0aW1lID0gbmV3IERhdGUodG9UaW1lLmdldFRpbWUoKSAtIGRheXMgKiAyNCAqIDYwICogNjAgKiAxMDAwKTtcbiAgICAvL3ByaW50IHRoZSBzdGFydCBhbmQgZmluaXNoIHRpbWVcbiAgICBjb25zb2xlLmxvZygnU3RhcnQgdGltZSBmb3IgdGhlIGF2ZXJhZ2Ugc2NvcmUgb2YgdGhlIGxhc3Q6JywgZGF5cywgJ251bWJlciBvZiBkYXlzIGlzOiAnLCB0aW1lLnRvSVNPU3RyaW5nKCkpO1xuICAgIGNvbnNvbGUubG9nKCdGaW5pc2ggdGltZSBmb3IgdGhlIGF2ZXJhZ2Ugc2NvcmUgb2YgdGhlIGxhc3Q6JywgZGF5cywgJ251bWJlciBvZiBkYXlzIGlzOiAnLCB0b1RpbWUudG9JU09TdHJpbmcoKSk7XG4gICAgLy8gUHJlcGFyZSBwYXJhbWV0ZXJzIGZvciB0aGUgQVBJIGNhbGxcbiAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICBsb2NhdGlvbjogbG9jYXRpb24sXG4gICAgICB0aW1lOiB0aW1lLnRvSVNPU3RyaW5nKCksXG4gICAgICB0b1RpbWU6IHRvVGltZS50b0lTT1N0cmluZygpLFxuICAgIH07XG5cbiAgICB0cnkge1xuICAgICAgLy8gTWFrZSB0aGUgQVBJIGNhbGwgdG8gcmV0cmlldmUgZW1pc3Npb25zIGRhdGEgZm9yIHRoZSBsYXN0IDEwIGRheXMgZm9yIHRoZSBzcGVjaWZpZWQgbG9jYXRpb25cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZ2V0UmVzcG9uc2UoJy9lbWlzc2lvbnMvYnlsb2NhdGlvbnMnLCAnR0VUJywgcGFyYW1zKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgdGhlIHJlc3BvbnNlIGNvbnRhaW5zIGRhdGFcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgYXZlcmFnZSBzY29yZSBmcm9tIHRoZSByZXNwb25zZSBkYXRhXG4gICAgICAgIGNvbnN0IHRvdGFscmF0aW5nID0gcmVzcG9uc2UucmVkdWNlKChhY2M6IG51bWJlciwgY3VycjogeyByYXRpbmc6IG51bWJlciB9KSA9PiBhY2MgKyBjdXJyLnJhdGluZywgMCk7XG4gICAgICAgIGNvbnN0IGF2ZXJhZ2VyYXRpbmcgPSB0b3RhbHJhdGluZyAvIHJlc3BvbnNlLmxlbmd0aDtcbiAgICAgICAgcmV0dXJuIGF2ZXJhZ2VyYXRpbmc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBubyBkYXRhIGF2YWlsYWJsZSBmb3IgdGhlIHNwZWNpZmllZCBsb2NhdGlvbiBhbmQgdGltZSBmcmFtZVxuICAgICAgICBjb25zb2xlLmxvZygnTm8gZGF0YSBhdmFpbGFibGUgZm9yIHRoZXRoZSBsYXN0ICcsIGRheXMsICdkYXlzIGZvciBsb2NhdGlvbjonLCBsb2NhdGlvbiwpO1xuICAgICAgICBjb25zb2xlLmxvZygnUmV0dXJuaW5nIG51bGwgc28gcG90ZW50aWFsIGlzc3VlIGlmIHlvdSBwZXJmb20gZm9yZWNhc3RpbmcgZm9yIHRoaXMgbG9jYXRpb24nKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgfVxuICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIHJldHJpZXZlIGVtaXNzaW9ucyBkYXRhOicsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIC8vIHRoZSBDYXJib25Bd2FyZUFkdmlzb3IgcmV0dXJucyB0aGUgbWV0YWRhdGEgYW5kIHRoZSBleGVjdXRlIGZ1bmN0aW9uXG4gIC8vIHNvIHRoYXQgZWFucyB0aGF0IGV2ZXJ5IHRpbWUgdGhpcyBtb2RlbCBpcyBydW4gdGhlIGV4ZWN1dGUgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWRcbiAgcmV0dXJuIHtcbiAgICBtZXRhZGF0YSxcbiAgICBleGVjdXRlLFxuICAgIGdldEF2ZXJhZ2VTY29yZUZvckxhc3RYRGF5cyxcbiAgICBzdXBwb3J0ZWRMb2NhdGlvbnNcbiAgfTtcbn1cbiJdfQ==