"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CarbonAwareAdvisor = void 0;
const axios_1 = require("axios");
const helpers_1 = require("../../util/helpers");
const errors_1 = require("../../util/errors");
const fs_1 = require("fs");
const path = require("path");
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
    let locationsFilePath = path.join(__dirname, 'locations.json');
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
            results[0]['plotted-points'] = plotted_points;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbGliL2NhcmJvbi1hd2FyZS1hZHZpc29yL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLGlDQUEwQjtBQUcxQixnREFBdUQ7QUFDdkQsOENBQTJDO0FBQzNDLDJCQUE0QztBQUM1Qyw2QkFBNkI7QUFHN0IsZ0RBQWdEO0FBQ3pDLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxNQUFvQixFQUFtQixFQUFFO0lBQzFFLE1BQU0sRUFBRSxvQkFBb0IsRUFBRSxHQUFHLGVBQU0sQ0FBQyxDQUFDLHFCQUFxQjtJQVM5RCxNQUFNLFFBQVEsR0FBRztRQUNmLElBQUksRUFBRSxTQUFTO0tBQ2hCLENBQUM7SUFFRjs7T0FFRztJQUNILE1BQU0sT0FBTyxHQUFHLHVCQUF1QixDQUFDO0lBRXhDOzs7O09BSUc7SUFFSCxJQUFJLGdCQUFnQixHQUFnQixJQUFJLEdBQUcsRUFBRSxDQUFDO0lBRTlDOzs7O09BSUc7SUFDSCxJQUFJLGlCQUFpQixHQUFtQixJQUFJLEdBQUcsRUFBRSxDQUFDO0lBRWxEOzs7O09BSUc7SUFDSCxJQUFJLGtCQUFrQixHQUFnQixJQUFJLEdBQUcsRUFBRSxDQUFDO0lBQ2hELG9IQUFvSDtJQUNwSCxJQUFJLGlCQUFpQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFHL0Qsb0ZBQW9GO0lBQ3BGLElBQUksV0FBVyxHQUFZLEtBQUssQ0FBQztJQUNqQyxJQUFJLFFBQVEsR0FBVyxDQUFDLENBQUM7SUFFekIsMENBQTBDO0lBQzFDLE1BQU0sY0FBYyxHQUFXLEVBQUUsQ0FBQztJQUVsQyw0SkFBNEo7SUFDNUosMkJBQTJCO0lBQzNCLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBRzNCLCtEQUErRDtJQUMvRCxJQUFJLFlBQVksR0FBRyxJQUFBLDJCQUFp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LENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNwQyxxREFBcUQ7Z0JBQ3JELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFXLEVBQUUsSUFBd0IsRUFBRSxFQUFFLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JHLE1BQU0sYUFBYSxHQUFHLFdBQVcsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO2dCQUNwRCxPQUFPLGFBQWEsQ0FBQztZQUN2QixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sOERBQThEO2dCQUM5RCxPQUFPLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBRSxRQUFRLENBQUUsQ0FBQztnQkFDekYsT0FBTyxDQUFDLEdBQUcsQ0FBQywrRUFBK0UsQ0FBQyxDQUFDO2dCQUM3RixPQUFPLElBQUksQ0FBQztZQUNkLENBQUM7UUFDSCxDQUFDO1FBQ0QsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNiLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDM0QsTUFBTSxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0gsQ0FBQyxDQUFBO0lBRUQsdUVBQXVFO0lBQ3ZFLHFGQUFxRjtJQUNyRixPQUFPO1FBQ0wsUUFBUTtRQUNSLE9BQU87UUFDUCwyQkFBMkI7UUFDM0Isa0JBQWtCO0tBQ25CLENBQUM7QUFDSixDQUFDLENBQUE7QUFqbUJZLFFBQUEsa0JBQWtCLHNCQWltQjlCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGF4aW9zIGZyb20gJ2F4aW9zJztcbmltcG9ydCB7IFBsdWdpbkludGVyZmFjZSB9IGZyb20gJy4uLy4uL2ludGVyZmFjZXMnO1xuaW1wb3J0IHsgQ29uZmlnUGFyYW1zLCBQbHVnaW5QYXJhbXMgfSBmcm9tICcuLi8uLi90eXBlcy9jb21tb24nO1xuaW1wb3J0IHsgYnVpbGRFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi91dGlsL2hlbHBlcnMnO1xuaW1wb3J0IHsgRVJST1JTIH0gZnJvbSAnLi4vLi4vdXRpbC9lcnJvcnMnO1xuaW1wb3J0IHsgcHJvbWlzZXMgYXMgZnNQcm9taXNlcyB9IGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cblxuLy8gTWFrZSBzdXJlIHlvdSBoYXZlIHRoZSAncXMnIGxpYnJhcnkgaW5zdGFsbGVkXG5leHBvcnQgY29uc3QgQ2FyYm9uQXdhcmVBZHZpc29yID0gKHBhcmFtczogQ29uZmlnUGFyYW1zKTogUGx1Z2luSW50ZXJmYWNlID0+IHtcbiAgY29uc3QgeyBJbnB1dFZhbGlkYXRpb25FcnJvciB9ID0gRVJST1JTOyAvL3VzZWQgZm9yIGV4Y2VwdGlvbnNcblxuICBpbnRlcmZhY2UgRW1pc3Npb25zRGF0YSB7IC8vaW50ZXJmYWNlIGZvciB0aGUgZW1pc3Npb25zIGRhdGEgcmV0dXJuZWQgYnkgdGhlIEFQSVxuICAgIGxvY2F0aW9uOiBzdHJpbmc7XG4gICAgdGltZTogc3RyaW5nO1xuICAgIHJhdGluZzogbnVtYmVyO1xuICAgIGR1cmF0aW9uOiBzdHJpbmc7XG4gIH1cblxuICBjb25zdCBtZXRhZGF0YSA9IHsgIC8vbmVjZXNzYXJ5IG1ldGFkYXRhIHJldHVycm5lZCBieSB0aGUgbmV3IHZlcnNpb24gb2YgdGhlIGltcGFjdCBlbmdpbmUgaW50ZXJmYWNlXG4gICAga2luZDogJ2V4ZWN1dGUnXG4gIH07XG5cbiAgLyoqXG4gICAqIFJvdXRlIHRvIHRoZSBjYXJib24tYXdhcmUtc2RrIEFQSS4gTG9jYWxob3N0IGZvciBub3cuXG4gICAqL1xuICBjb25zdCBBUElfVVJMID0gXCJodHRwOi8vbG9jYWxob3N0OjUwNzNcIjtcblxuICAvKipcbiAgICogQWxsb3dlZCBsb2NhdGlvbiBwYXJhbWV0ZXIgdGhhdCBpcyBwYXNzZWQgaW4gdGhlIGNvbmZpZyBvZiB0aGUgbW9kZWwuXG4gICAqIFRoZSBhcmd1bWVudHMgYXJlIHN0b3JlZCBpbiBhIHNldCB0byBhdm9pZCBkdXBsaWNhdGVzLlxuICAgKiB0aGUgYWN0dWFsIGxvY2F0aW9ucyB3aWxsIHBvcHVsYXRlIHRoaXMgc2V0IGR1cmluZyBleGVjdXRpb24gYWZ0ZXIgY2VydGFpbiBjaGVja3NcbiAgICovXG5cbiAgbGV0IGFsbG93ZWRMb2NhdGlvbnM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXG4gIC8qKlxuICAgKiBBbGxvd2VkIHRpbWVmcmFtZSBwYXJhbWV0ZXIgdGhhdCBpcyBwYXNzZWQgaW4gdGhlIGNvbmZpZyBvZiB0aGUgbW9kZWwuXG4gICAqIFRoZSBhcmd1bWVudHMgYXJlIHN0b3JlZCBpbiBhIHNldCB0byBhdm9pZCBkdXBsaWNhdGVzLlxuICAgKiB0aGUgYWN0dWFsIHRpbWVmcmFtZXMgd2lsbCBwb3B1bGF0ZSB0aGlzIHNldCBkdXJpbmcgZXhlY3V0aW9uIGFmdGVyIGNlcnRhaW4gY2hlY2tzXG4gICAqL1xuICBsZXQgYWxsb3dlZFRpbWVmcmFtZXM6IFNldDxUaW1lZnJhbWU+ID0gbmV3IFNldCgpO1xuXG4gIC8qKlxuICAgKiBMaXN0IG9mIGFsbCBsb2NhdGlvbnMgdGhhdCBhcmUgc3VwcG9ydGVkIGJ5IHRoZSBjYXJib24tYXdhcmUtc2RrLlxuICAgKiBUaGlzIGlzIHVzZWQgdG8gdmFsaWRhdGUgdGhlIGlucHV0cyBwcm92aWRlZCBieSB0aGUgdXNlci5cbiAgICogSW5pdGlhbGl6ZWQgYnkgcmVhZGluZyB0aGUgbG9jYXRpb25zLmpzb24gZmlsZSBpbiB0aGUgc2V0U3VwcG9ydGVkTG9jYXRpb25zKCkgZnVuY3Rpb24uXG4gICAqL1xuICBsZXQgc3VwcG9ydGVkTG9jYXRpb25zOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcbiAgLy8gVXNlIGZvciByZWFkIGZyb20gbG9jYXRpb25zLmpzb24gLiBXZSBuZWVkIHRvIGJlIGNhcmVmdWwgd2hlbiB3ZSBjb21taXQgdG8gdGhlIGltcGFjdCBmcmFtZXdvcmsgZGlyIGZvciB0aGlzIHBhdGhcbiAgbGV0IGxvY2F0aW9uc0ZpbGVQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJ2xvY2F0aW9ucy5qc29uJyk7XG5cblxuICAvL2ZsYWcgdG8gY2hlY2sgaWYgdGhlIG1vZGVsIGhhcyBzYW1wbGluZywgdGhlIHNhbXBsaW5nIHZhbHVlIGlzIG9yaWdpbmFsbHkgc2V0IHRvIDBcbiAgbGV0IGhhc1NhbXBsaW5nOiBib29sZWFuID0gZmFsc2U7XG4gIGxldCBzYW1wbGluZzogbnVtYmVyID0gMDtcblxuICAvL251bWJlciBvZiBsYXN0IGRheXMgdG8gZ2V0IGF2ZXJhZ2Ugc2NvcmVcbiAgY29uc3QgbGFzdERheXNOdW1iZXI6IG51bWJlciA9IDEwO1xuXG4gIC8vd2VpZ2h0cyBmb3IgdGhlIGZvcmVjYXN0aW5nLCB0aGUgZmlyc3Qgd2VpZ2h0IGlzIHRoYXQgb2YgdGhlIGF2ZXJhZ2Ugb2YgbGFzdCAxMCBkYXlzIGFuZCB0aGUgc2Vjb25kIHdlaWdodCBpcyB0aGF0IG9mIHRoZSBsYXN0IGF2YWlsYWJsZSB5ZWFyIG9uIHRoYXQgZGF0ZVxuICAvL3RoZSB3ZWlnaHRzIG11c3Qgc3VtIHRvIDFcbiAgY29uc3Qgd2VpZ2h0cyA9IFswLjUsIDAuNV07XG5cblxuICAvL0Vycm9yIGJ1aWxkZXIgZnVuY3Rpb24gdGhhdCBpcyB1c2VkIHRvIGJ1aWxkIGVycm9yIG1lc3NhZ2VzLiBcbiAgbGV0IGVycm9yQnVpbGRlciA9IGJ1aWxkRXJyb3JNZXNzYWdlKCdDYXJib25Bd2FyZUFkdmlzb3InKTtcblxuXG4gIC8qKlxuICAqIHRoaXMgZnVuY3Rpb24gaXMgdGhlIG1haW4gZnVuY3Rpb24gb2YgdGhlIG1vZGVsLCBpdCBpcyBjYWxsZWQgYnkgdGhlIGltcGwgZmlsZVxuICAqIGl0IHRha2VzIHRoZSBpbnB1dHMgZnJvbSB0aGUgaW1wbCBmaWxlIGFuZCByZXR1cm5zIHRoZSByZXN1bHRzIG9mIHRoZSBtb2RlbFxuICAqIGl0IHZhbGlkYXRlcyB0aGVtIHRoYXQgYWxsIHRoZSByZXF1aXJlZCBwYXJhbWV0ZXJzIGFyZSBwcm92aWRlZCBhbmQgYXJlIG9mIHRoZSBjb3JyZWN0IHR5cGVcbiAgKiBhbmQgdGhlbiBjYWxscyB0aGUgY2FsY3VsYXRlIGZ1bmN0aW9uIHRvIHBlcmZvcm0gdGhlIGFjdHVhbCBjYWxjdWxhdGlvbnNcbiAgKiBAcGFyYW0gaW5wdXRzIHRoZSBpbnB1dHMgZnJvbSB0aGUgaW1wbCBmaWxlXG4gICogQHJldHVybnMgdGhlIHJlc3VsdHMgb2YgdGhlIG1vZGVsXG4gICovXG4gIGNvbnN0IGV4ZWN1dGUgPSBhc3luYyAoaW5wdXRzOiBQbHVnaW5QYXJhbXNbXSkgPT4ge1xuICAgIC8vIGF3YWl0IHZhbGlkYXRlSW5wdXRzKGNvbmZpZ3MpO1xuICAgIC8vZWNobyB0aGF0IHlvdSBhcmUgaW4gdGhlIGV4ZWN1dGUgZnVuY3Rpb25cbiAgICBhd2FpdCB2YWxpZGF0ZUlucHV0cygpO1xuICAgIGNvbnNvbGUubG9nKCdZb3UgYXJlIGluIHRoZSBleGVjdXRlIGZ1bmN0aW9uJyk7XG4gICAgLy9jYWxsIHRoZSBjYWxjdWxhdGUgZnVuY3Rpb24gdG8gcGVyZm9ybSB0aGUgYWN0dWFsIGNhbGN1bGF0aW9uc1xuICAgIHJldHVybiBhd2FpdCBjYWxjdWxhdGUoaW5wdXRzKTtcbiAgfVxuXG4gIC8qKlxuICAqIHRoaXMgaXMgdGhlIGZ1bmN0aW9uIHRoYXQgcGVyZm9ybXMgYWxsIHRoZSBhcGkgY2FsbHMgYW5kIHJldHVybnMgdGhlIGFjdHVhbCByZXN1bHRzLCBcbiAgKiBpdCBpcyB0aGUgY29yZSBvZiB0aGUgQ2FyYm9uQXdhcmUgQWR2aXNvciBtb2RlbCBhbmQgaXQgaXMgY2FsbGVkIGJ5IHRoZSBleGVjdXRlIGZ1bmN0aW9uXG4gICovXG4gIGNvbnN0IGNhbGN1bGF0ZSA9IGFzeW5jIChpbnB1dHM6IFBsdWdpblBhcmFtc1tdKTogUHJvbWlzZTxQbHVnaW5QYXJhbXNbXT4gPT4ge1xuICAgIC8vZGVwZW5kaW5nIG9uIGlmIHdlIGhhdmUgc2FtcGxpbmcgb3Igbm90IHRoZSByZXN1bHQgbWFwIHRoYXQgd2lsbCBiZSByZXR1cm5lZCB3aWxsIGJlIGRpZmZlcmVudC4gXG4gICAgLy9pZiBoYXNzYW1wbGluZyA9dHJ1ZSB0aGVuIHdlIG5lZWQgcGxvdHRlZCBwb2ludHMgYXMgd2VsbFxuXG4gICAgbGV0IHJlc3VsdHM6IFBsdWdpblBhcmFtc1tdID0gW11cbiAgICBpZiAoaGFzU2FtcGxpbmcpIHtcbiAgICAgIHJlc3VsdHMgPSBpbnB1dHMubWFwKGlucHV0ID0+ICh7XG4gICAgICAgIC4uLmlucHV0LFxuICAgICAgICBzdWdnZXN0aW9uczogW10sXG4gICAgICAgICdwbG90dGVkLXBvaW50cyc6IFtdXG4gICAgICB9KSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcmVzdWx0cyA9IGlucHV0cy5tYXAoaW5wdXQgPT4gKHtcbiAgICAgICAgLi4uaW5wdXQsXG4gICAgICAgIHN1Z2dlc3Rpb25zOiBbXVxuICAgICAgfSkpO1xuICAgIH1cbiAgICAvLyBjcmVhdGUgYW4gYXJyYXkgZnJvbSB0aGUgZ2xvYmFsIGxvY2F0aW9uc0FycmF5IHNldCB0aGF0IHdhcyBwb3B1bGF0ZWQgZHVyaW5nIHRoZSB2YWxpZGF0aW9uIG9mIHRoZSBpbnB1dHNcbiAgICBjb25zdCBsb2NhdGlvbnNBcnJheSA9IFsuLi5hbGxvd2VkTG9jYXRpb25zXTtcbiAgICBsZXQgQmVzdERhdGE6IGFueVtdID0gW107XG4gICAgbGV0IHBsb3R0ZWRfcG9pbnRzOiBhbnlbXSA9IFtdO1xuICAgIGxldCBBbGxCZXN0RGF0YTogYW55W10gPSBbXTtcblxuICAgIC8vIFdlIGRlZmluZSBhIG1hcCBhdmVyYWdlU2NvcmVzQnlMb2NhdGlvbiB0byBmaW5kIHRoZSBhdmVyYWdlIHNjb3JlIGZvciBlYWNoIGxvY2F0aW9uIGZvciB0aGUgbGFzdCBsYXN0RGF5c051bWJlciBkYXlzXG4gICAgY29uc3QgYXZlcmFnZVNjb3Jlc0J5TG9jYXRpb246IHsgW2tleTogc3RyaW5nXTogbnVtYmVyIHwgbnVsbCB9ID0ge307XG5cbiAgICAvLyBGb3IgZWFjaCBsb2NhdGlvbiwgZ2V0IHRoZSBhdmVyYWdlIHNjb3JlIGZvciB0aGUgbGFzdCBsYXN0RGF5c051bWJlciBkYXlzXG4gICAgZm9yIChjb25zdCBsb2NhdGlvbiBvZiBsb2NhdGlvbnNBcnJheSkge1xuICAgICAgY29uc29sZS5sb2coYEdldHRpbmcgYXZlcmFnZSBzY29yZSBmb3IgbG9jYXRpb24gJHtsb2NhdGlvbn0gb3ZlciB0aGUgbGFzdCAke2xhc3REYXlzTnVtYmVyfSBkYXlzYCk7XG4gICAgICAvLyBHZXQgdGhlIGF2ZXJhZ2Ugc2NvcmUgZm9yIHRoZSBsb2NhdGlvbiBmb3IgbGFzdERheXNOdW1iZXIgZGF5c1xuICAgICAgY29uc3QgYXZlcmFnZVNjb3JlID0gYXdhaXQgZ2V0QXZlcmFnZVNjb3JlRm9yTGFzdFhEYXlzKGxhc3REYXlzTnVtYmVyLCBsb2NhdGlvbik7XG5cbiAgICAgIC8vIFN0b3JlIHRoZSBhdmVyYWdlIHNjb3JlIGluIHRoZSBkaWN0aW9uYXJ5IHdpdGggdGhlIGxvY2F0aW9uIGFzIHRoZSBrZXlcbiAgICAgIGF2ZXJhZ2VTY29yZXNCeUxvY2F0aW9uW2xvY2F0aW9uXSA9IGF2ZXJhZ2VTY29yZTtcbiAgICB9XG5cbiAgICAvL2lmIHdlIGhhdmUgc2FtcGxpbmcgdGhlbiBjYWxjdWxhdGUgdGhlIGFsbG9jYXRpb25zIG9mIHRoZSBwbG90dGVkIHBvaW50cyBwZXIgdGltZWZyYW1lXG4gICAgY29uc3QgYWxsb2NhdGlvbnM6IGFueVtdID0gaGFzU2FtcGxpbmcgPyBjYWxjdWxhdGVTdWJyYW5nZUFsbG9jYXRpb24oc2FtcGxpbmcpIDogWzFdO1xuXG4gICAgLy9QcmludCB0aGUgYWxsb2NhdGlvbnMgYW5kIHRoZSBhdmVyYWdlIHNjb3JlcyBieSBsb2NhdGlvblxuICAgIGNvbnNvbGUubG9nKCdBbGxvY2F0aW9uczonLCBhbGxvY2F0aW9ucyk7XG4gICAgY29uc29sZS5sb2coXCJBdmVyYWdlIFNjb3JlcyBieSBMb2NhdGlvbjpcIiwgYXZlcmFnZVNjb3Jlc0J5TG9jYXRpb24pO1xuXG4gICAgLy8gRm9yIGVhY2ggdGltZWZyYW1lLCBnZXQgdGhlIHJlc3BvbnNlIGZyb20gdGhlIEFQSVxuICAgIGZvciAoY29uc3QgW2luZGV4LCB0aW1lZnJhbWVdIG9mIEFycmF5LmZyb20oYWxsb3dlZFRpbWVmcmFtZXMpLmVudHJpZXMoKSkge1xuICAgICAgLy8gR2V0IHRoZSBjdXJyZW50IGFsbG9jYXRpb24gZm9yIHRoYXQgdGltZWZyYW1lIChob3cgbWFueSBwbG90dGVkIHBvaW50cyB3ZSBuZWVkIHRvIGV4dHJhY3QgZnJvbSB0aGF0IHNwZWNpZmljIHRpbWVmcmFtZSlcbiAgICAgIGNvbnN0IGN1cnJBbGxvY2F0aW9uID0gYWxsb2NhdGlvbnNbaW5kZXhdIC0gMTtcbiAgICAgIC8vaXNGb3JlY2FzdCBpcyBhIHZhcmlhYmxlIHRlbGxpbmcgdXMgaWYgdGhlIGN1cnJlbnQgdGltZWZyYW1lIGlzIGluIHRoZSBmdXR1cmUgKG1lYW5pbiB0aGF0IHRoZXJlIGlzIG5vIGRhdGEgZnJvbSB0aGUgQVBpIGZvciB0aGF0IHRpbWVmcmFtZSlcbiAgICAgIGxldCBpc0ZvcmVjYXN0ID0gZmFsc2U7XG4gICAgICAvL251bU9mWWVhcnMgaXMgYSB2YXJpYWJsZSB0aGF0IHRlbGxzIHVzIGhvdyBtYW55IHllYXJzIHdlIGhhdmUgZ29uZSBpbiB0aGUgcGFzdCB0byBmaW5kIGRhdGEgZm9yIHRoYXQgZm9yZWNhc3RcbiAgICAgIGxldCBudW1PZlllYXJzID0gMDtcbiAgICAgIGxldCBtdXRhYmxlVGltZWZyYW1lOiBUaW1lZnJhbWUgPSB0aW1lZnJhbWU7XG4gICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAvLyBQcmVwYXJlIHBhcmFtZXRlcnMgZm9yIHRoZSBBUEkgY2FsbFxuICAgICAgICBjb25zdCBwYXJhbXMgPSB7XG4gICAgICAgICAgbG9jYXRpb246IGxvY2F0aW9uc0FycmF5LFxuICAgICAgICAgIHRpbWU6IG11dGFibGVUaW1lZnJhbWUuZnJvbSxcbiAgICAgICAgICB0b1RpbWU6IG11dGFibGVUaW1lZnJhbWUudG9cbiAgICAgICAgfTtcbiAgICAgICAgLy9pZiBwYXJhbXMsdGltZSBhbmQgcGFyYW1zLnRvVGltZSBhcmUgYmVmb3JlIG5vdyB3ZSBkb250IGhhdmUgYSBmb3JlY2FzdFxuICAgICAgICBpZiAocGFyYW1zLnRpbWUgPCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgJiYgcGFyYW1zLnRvVGltZSA8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSkge1xuXG4gICAgICAgICAgLy8gUmV0dXJucyBhbiBhcnJheSBvZiBhbGwgRW1pc3Npb25zRGF0YSBvYmplY3RzIGZvciB0aGF0IHRpbWVmcmFtZSBhbmQgbG9jYXRpb25zXG4gICAgICAgICAgbGV0IGFwaV9yZXNwb25zZSA9IGF3YWl0IGdldFJlc3BvbnNlKFwiL2VtaXNzaW9ucy9ieWxvY2F0aW9uc1wiLCAnR0VUJywgcGFyYW1zKTtcbiAgICAgICAgICBpZiAoYXBpX3Jlc3BvbnNlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBBUEkgY2FsbCBzdWNjZWVkZWQgZm9yIHRpbWVmcmFtZSBzdGFydGluZyBhdCAke3RpbWVmcmFtZS5mcm9tfSBgKTtcbiAgICAgICAgICAgIC8vaWYgdGhlIGFwaSBjYWxsIGlzIGEgZm9yZWNhc3QgdGhlbiB3ZSBuZWVkIHRvIG5vcm1hbGl6ZSB0aGUgdmFsdWVzIHRvIGNoYW5nZSB0aGUgeWVhciBhbmQgdGhlIHJhdGluZ1xuICAgICAgICAgICAgLy9mb3IgZXhhbXBsZSBpZiB3ZSBtYWRlIGEgZm9yZWNhdCBmb3IgMjAyNSBhbmQgd2UgYXJlIGluIDIwMjMgdGhlbiB3ZSBuZWVkIHRvIGFkanVzdCB0aGUgeWVhciBiYWNrIHRvIDIwMjUgYW5kIHRoZSByYXRpbmcgYmFzZWQgb24gdGhlIHdlaWdodHNcbiAgICAgICAgICAgIGlmIChpc0ZvcmVjYXN0KSB7XG4gICAgICAgICAgICAgIGFwaV9yZXNwb25zZSA9IGFkanVzdFJhdGluZ3NBbmRZZWFycyhhcGlfcmVzcG9uc2UsIG51bU9mWWVhcnMsIGF2ZXJhZ2VTY29yZXNCeUxvY2F0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vdGhlIG1pblJhdGluZyBpcyB0aGUgcmF0aW5nIGZyb20gdGhlIEVtaXNzaW9uc0RhdGEgIG9mIHRoZSByZXNwb25zZSB0aGF0IGlzIHRoZSBsb3dlc3RcbiAgICAgICAgICAgIGNvbnN0IG1pblJhdGluZyA9IE1hdGgubWluKC4uLmFwaV9yZXNwb25zZS5tYXAoKGl0ZW06IEVtaXNzaW9uc0RhdGEpID0+IGl0ZW0ucmF0aW5nKSk7XG5cbiAgICAgICAgICAgIC8vIGhlcmUgd2UgZmluZCBhbGwgdGhlIEVtaXNzaW9uc0RhdGEgb2JqZWN0cyBmcm9tIHRoZSByZXNwb25zZSB0aGF0IGhhdmUgdGhlIGxvd2VzdCByYXRpbmdcbiAgICAgICAgICAgIGNvbnN0IGl0ZW1zV2l0aE1pblJhdGluZyA9IGFwaV9yZXNwb25zZS5maWx0ZXIoKGl0ZW06IEVtaXNzaW9uc0RhdGEpID0+IGl0ZW0ucmF0aW5nID09PSBtaW5SYXRpbmcpO1xuXG4gICAgICAgICAgICAvLyBXZSBzdG9yZSAgdGhhdCAgRW1pc3Npb25zRGF0YSBvYmplY3RzIGZyb20gdGhlIHJlc3BvbnNlIHRoYXQgaGF2ZSB0aGUgbG93ZXN0IHJhdGluZ1xuICAgICAgICAgICAgQmVzdERhdGEgPSBCZXN0RGF0YS5jb25jYXQoaXRlbXNXaXRoTWluUmF0aW5nKTtcblxuICAgICAgICAgICAgLy9pZiB3ZSBoYXZlIHNhbXBsaW5nIHRoZW4gd2UgbmVlZCB0byBzdG9yZSB0aGUgb25lIChhdCByYW5kb20pIG9mIHRoZSBtaW5pbXVtIEVtaXNzaW9uc0RhdGEgb2JqZWN0cyB0byBiZSByZXR1cm5lZCBpbiB0aGUgcGxvdHRlZCBwb2ludHNcbiAgICAgICAgICAgIGNvbnN0IHJhbmRvbUluZGV4ID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogaXRlbXNXaXRoTWluUmF0aW5nLmxlbmd0aCk7XG4gICAgICAgICAgICBwbG90dGVkX3BvaW50cy5wdXNoKGl0ZW1zV2l0aE1pblJhdGluZ1tyYW5kb21JbmRleF0pO1xuXG4gICAgICAgICAgICAvLyBBbGwgb2YgdGhlIEVtaXNzaW9uc0RhdGEgb2JqZWN0cyBmcm9tIHRoZSByZXNwb25zZSB0aGF0IGhhdmUgdGhlIGxvd2VzdCByYXRpbmcgYXJlIHN0b3JlZCBpbiBBbGxCZXN0RGF0YSwgd2hlcmUgdGhlIGJlc3Qgb2YgYWxsIGFwaSBjYWxscyB3aWxsIGJlIHN0b3JlZFxuICAgICAgICAgICAgQWxsQmVzdERhdGEgPSBbLi4uQWxsQmVzdERhdGEsIC4uLml0ZW1zV2l0aE1pblJhdGluZ107XG5cbiAgICAgICAgICAgIC8vaWYgaGFzU2FtcGxpbmcgaXMgdHJ1ZSAgdGhlbiB3ZSBuZWVkIG1vcmUgdGhhbiB0aGUgYmVzdCB2YWx1ZSwgd2UgbmVlZCBzb21lIGV4dHJhIHZhbHVlcyB0byBiZSByZXR1cm5lZCBpbiB0aGUgcGxvdHRlZCBwb2ludHMgKGFzIG1hbnkgYXMgdGhlIGFsbG9jYXRpb24gc2F5cylcbiAgICAgICAgICAgIGlmIChoYXNTYW1wbGluZykge1xuICAgICAgICAgICAgICAvL3JlbW92ZSBmcm9tIGJlc3QgYXJyYXkgYWxsIHRoZSBlbGVtZW50cyB0aGF0IGFyZSBpbiBpdGVtc1dpdGhNaW5SYXRpbmcsIHdlIGhhdmUgYWxyZWFkeSBzdG9yZWQgb25lIG9mIHRoZW1cbiAgICAgICAgICAgICAgYXBpX3Jlc3BvbnNlID0gYXBpX3Jlc3BvbnNlLmZpbHRlcigoaXRlbTogRW1pc3Npb25zRGF0YSkgPT4gIWl0ZW1zV2l0aE1pblJhdGluZy5pbmNsdWRlcyhpdGVtKSk7XG4gICAgICAgICAgICAgIC8vc2VsZWN0IGN1cnJBbGxvY2F0aW9uIGVsZW1uZXRzIGF0IHJhbmRvbSBmcm9tIHRoZSByZW1haW5pbmcgaXRlbXMgaW4gdGhlIGFwaV9yZXNwb25zZSBhcnJheVxuICAgICAgICAgICAgICAvL2FuZCBhZGQgdGhlbSB0byB0aGUgcGxvdHRlZF9wb2ludHNcbiAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjdXJyQWxsb2NhdGlvbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmFuZEluZGV4ID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogYXBpX3Jlc3BvbnNlLmxlbmd0aCk7XG4gICAgICAgICAgICAgICAgcGxvdHRlZF9wb2ludHMucHVzaChhcGlfcmVzcG9uc2Uuc3BsaWNlKHJhbmRJbmRleCwgMSlbMF0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhazsgLy8gQnJlYWsgdGhlIGxvb3AgaWYgd2UgaGF2ZSBmb3VuZCBkYXRhIGZvciB0aGUgY3VycmVudCB0aW1lZnJhbWUgYW5kIGxvY2F0aW9ucyBhbmQgc2VhcmNoIGZvciB0aGUgbmV4dCB0aW1lZnJhbWVcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy9pZiB3ZSBoYXZlIHJlYWNoZWQgdGhpcyBwYXJ0IG9mIHRoZSBjb2RlIHRoZW4gdGhhdCBtZWFucyB0aGF0IGZvciB0aGlzIHRpbWVmcmFtZSB3ZSBhcmUgZm9yZWNhc3RpbmdcbiAgICAgICAgaXNGb3JlY2FzdCA9IHRydWU7XG4gICAgICAgIC8vIEFkanVzdCB0aW1lZnJhbWUgYnkgZGVjcmVhc2luZyB0aGUgeWVhciBieSBvbmUgdG8gZG8gYW4gQVBJIGNhbGwgZm9yIHRoZSBwcmV2aW91cyB5ZWFyIHRoZSBlbnh0IHRpbWVcbiAgICAgICAgbXV0YWJsZVRpbWVmcmFtZSA9IGF3YWl0IGFkanVzdFRpbWVmcmFtZUJ5T25lWWVhcihtdXRhYmxlVGltZWZyYW1lKTtcbiAgICAgICAgLy9pbmNyZWFzZSB0aGUgbnVtT2ZZZWFycyB3ZSBoYXZlIGdvbmUgaW4gdGhlIHBhc3QgYnkgMVxuICAgICAgICBudW1PZlllYXJzKys7XG4gICAgICAgIGlmIChudW1PZlllYXJzID4gNSkgey8vIGlmIHlvdSBjYW50IGZpbmQgYW55IGRhdGEgNSB5ZWFycyBpbiB0aGUgcGFzdCB0aGVuIHN0b3Agc2VhcmNoaW5nXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBJbiB0aGUgQWxsQmVzdERhdGEgd2UgaGF2ZSB0aGUgYmVzdCB2YWx1ZXMgZnJvbSBhbGwgdGhlIGFwaSBjYWxscyAoc28gZm9yIGVhY2ggdGltZWZyYW1lKSwgd2UgbmVlZCB0byByZXR1cm4gdGhlIGJlc3Qgb2YgdGhlIGJlc3QuXG4gICAgY29uc3QgbG93ZXN0UmF0aW5nID0gTWF0aC5taW4oLi4uQWxsQmVzdERhdGEubWFwKGl0ZW0gPT4gaXRlbS5yYXRpbmcpKTtcbiAgICAvLyBGaWx0ZXIgYWxsIHJlc3BvbnNlcyB0byBnZXQgaXRlbXMgd2l0aCB0aGUgbG93ZXN0IHJhdGluZyAoaS5lLiB0aGUgYmVzdCByZXNwb25zZXMpXG4gICAgY29uc3QgZmluYWxTdWdnZXN0aW9ucyA9IEFsbEJlc3REYXRhLmZpbHRlcihpdGVtID0+IGl0ZW0ucmF0aW5nID09PSBsb3dlc3RSYXRpbmcpO1xuXG4gICAgLy8gU3RvcmUgdGhlIGZpbmFsIHN1Z2dlc3Rpb25zIGluIHRoZSBvdXRwdXQgcmVzdWx0c1xuICAgIHJlc3VsdHNbMF0uc3VnZ2VzdGlvbnMgPSBmaW5hbFN1Z2dlc3Rpb25zO1xuXG4gICAgLy8gSWYgd2UgaGF2ZSBzYW1wbGluZyBpbiB0aGUgcmVzdWx0IHdlIHJldHVybiB0aGUgcGxvdHRlZCBwb2ludHMgYXMgd2VsbCB3aGljaCBoYXZlIHNhbXBsZXMgZnJvbSBkaWZmZXJlbnQgdGltZWZyYW1lIGFuZCBsb2NhdGlvbnNcbiAgICBpZiAoaGFzU2FtcGxpbmcpIHtcbiAgICAgIHJlc3VsdHNbMF1bJ3Bsb3R0ZWQtcG9pbnRzJ10gPSBwbG90dGVkX3BvaW50cztcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cblxuICAvKipcbiAgKiB0aGlzIGZ1bmN0aW9uIGFkanVzdHMgdGhlIHJhdGluZ3MgYW5kIHllYXJzIG9mIHRoZSBmb3JlY2FzdGVkIGRhdGFcbiAgKiBpdCB0YWtlcyB0aGUgZm9yZWNhc3RlZCBkYXRhLCB0aGUgbnVtYmVyIG9mIHllYXJzIHRvIGFkZCBhbmQgdGhlIGF2ZXJhZ2Ugc2NvcmVzIGJ5IGxvY2F0aW9uXG4gICogaXQgcmV0dXJucyB0aGUgYWRqdXN0ZWQgZm9yZWNhc3RlZCBkYXRhIFxuICBAcGFyYW0gZW1pc3Npb25zRGF0YSBUaGUgZW1pc3Npb25zIHRoYXQgbmVlZCAgdG8gYmUgYWRqdXN0ZXMuXG4gIEBwYXJhbSB5ZWFyc1RvQWRkIGhvdyBtYW55IHllYXJzIGluIHRoZSBmdXR1cmUgdGhlIGZvcmVjYXN0IGlzXG4gIEBwYXJhbSBhdmVyYWdlU2NvcmVzQnlMb2NhdGlvbiB0aGUgYXZlcmFnZSBzY29yZXMgYnkgbG9jYXRpb24gZm9yIHRoZSBsYXN0IDEwIGRheXNcbiAgKi9cbiAgY29uc3QgYWRqdXN0UmF0aW5nc0FuZFllYXJzID0gKFxuICAgIGVtaXNzaW9uc0RhdGE6IEVtaXNzaW9uc0RhdGFbXSxcbiAgICB5ZWFyc1RvQWRkOiBudW1iZXIsXG4gICAgYXZlcmFnZVNjb3Jlc0J5TG9jYXRpb246IHsgW2tleTogc3RyaW5nXTogbnVtYmVyIHwgbnVsbCB9XG4gICk6IEVtaXNzaW9uc0RhdGFbXSA9PiB7XG4gICAgcmV0dXJuIGVtaXNzaW9uc0RhdGEubWFwKGRhdGEgPT4ge1xuICAgICAgLy9nZXQgdGhlIGF2ZXJhZ2UgcmF0aW5nIGZvciB0aGUgc3BlY2lmaWMgbG9jYXRpb25cbiAgICAgIGNvbnN0IGF2ZXJhZ2VSYXRpbmcgPSBhdmVyYWdlU2NvcmVzQnlMb2NhdGlvbltkYXRhLmxvY2F0aW9uXTtcbiAgICAgIC8vaWYgdGhlIGF2ZXJhZ2UgcmF0aW5nIGlzIG51bGwgdGhlbiB3ZSBkb250IGhhdmUgZGF0YSBmb3IgdGhlIGxhc3QgMTAgZGF5cyBmb3IgdGhhdCBsb2NhdGlvblxuICAgICAgLy9hbmQgd2Ugd2lsbCBiYXNlIHRoZSByYXRpbmcgb25seSBvbiB0aGUgb2xkIHZhbHVlIChub3Qgbm9ybWFsaXNlIGJhc2VkIG9uIHRoZSBsYXN0IDEwIGRheXMgYXZlcmFnZSByYXRpbmcpXG4gICAgICAvL2FkanVzdCB0aGUgcmF0aW5nIG9mIHRoaXMgbG9jYXRpb24gYmFzZWQgb24gdGhlIHdlaWdodHNcbiAgICAgIGNvbnN0IGFkanVzdGVkUmF0aW5nID0gYXZlcmFnZVJhdGluZyAhPT0gbnVsbCA/IChkYXRhLnJhdGluZyAqIHdlaWdodHNbMF0gKyBhdmVyYWdlUmF0aW5nICogd2VpZ2h0c1sxXSkgOiBkYXRhLnJhdGluZzsgLy8gSGFuZGxlIG51bGwgdmFsdWVzXG4gICAgICAvL2NyZWF0ZSB0aGUgbmV3IGRhdGUgYnkgbWFraW5nIHRoZSB5ZWFyIGVxdWFsIHRvIHRoZSB5ZWFyIG9mIHRoZSBmb3JlY2FzdChieSBhZGRpbmcgdGhlIHllYXJzIHdlIGhhdmUgZ29uZSBpbiB0aGUgcGFzdClcbiAgICAgIGNvbnN0IHRpbWUgPSBuZXcgRGF0ZShkYXRhLnRpbWUpO1xuICAgICAgdGltZS5zZXRGdWxsWWVhcih0aW1lLmdldEZ1bGxZZWFyKCkgKyB5ZWFyc1RvQWRkKTtcbiAgICAgIC8vcmV0dXJuIHRoZSBhZGp1c3RlZCBkYXRhXG4gICAgICByZXR1cm4geyAuLi5kYXRhLCByYXRpbmc6IGFkanVzdGVkUmF0aW5nLCB0aW1lOiB0aW1lLnRvSVNPU3RyaW5nKCkgfTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGp1c3QgdGhlIHRpbWVmcmFtZSBieSBkZWNyZWFzaW5nIHRoZSB5ZWFyIGJ5IG9uZS5cbiAgICogQHBhcmFtIHRpbWVmcmFtZSBUaGUgdGltZWZyYW1lIHRvIGFkanVzdC5cbiAgICogQHJldHVybnMgVGhlIGFkanVzdGVkIHRpbWVmcmFtZSB3aGljaCBpcyBvbmUgeWVhciBpbiB0aGUgcGFzdFxuICAgKiB3ZSBuZWVkIHRoaXMgZnVuY3Rpb24gdG8gYWRqdXN0IHRoZSB0aW1lZnJhbWUgaWYgdGhlIHRpbWVmcmFtZSBpcyBpbiB0aGUgZnV0dXJlIGFuZCB3ZSBuZWVkIHRvIHBlcmZvcm0gYW4gYXBpIGNhbGwgaW4gdGhlIHBhc3RcbiAgICovXG4gIGNvbnN0IGFkanVzdFRpbWVmcmFtZUJ5T25lWWVhciA9ICh0aW1lZnJhbWU6IFRpbWVmcmFtZSk6IFRpbWVmcmFtZSA9PiB7XG4gICAgLy8gQWRqdXN0IHRoZSB5ZWFyIG9mIHRoZSB0aW1lZnJhbWUgYnkgZGVjcmVhc2luZyBpdCBieSBvbmVcbiAgICBjb25zdCBhZGp1c3RZZWFyID0gKGRhdGVTdHJpbmc6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoZGF0ZVN0cmluZyk7XG4gICAgICBkYXRlLnNldEZ1bGxZZWFyKGRhdGUuZ2V0RnVsbFllYXIoKSAtIDEpO1xuICAgICAgcmV0dXJuIGRhdGUudG9JU09TdHJpbmcoKTtcbiAgICB9O1xuICAgIC8vcmV0dXJuIHRoZSBhZGp1c3RlZCB0aW1lZnJhbWUgYnkgZGVjcmVhc2luZyB0aGUgeWVhciBieSBvbmUgZm9yIHRoZSBzdGFydCBvZiB0aGUgdGltZWZyYW1lIGFuZCB0aGUgZW5kIG9mIHRoZSB0aW1lZnJhbWVcbiAgICByZXR1cm4ge1xuICAgICAgZnJvbTogYWRqdXN0WWVhcih0aW1lZnJhbWUuZnJvbSksXG4gICAgICB0bzogYWRqdXN0WWVhcih0aW1lZnJhbWUudG8pLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogU2V0IHRoZSBzdXBwb3J0ZWQgbG9jYXRpb25zIGJhc2VkIG9uIHRoZSBsb2NhdGlvbnMuanNvbiBmaWxlXG4gICAqIHRoZSBzdXBwb3J0ZWQgbG9jYXRpb25zIGFyZSB0aGUgbG9jYXRpb25zIHRoYXQgdGhlIG1vZGVsIGNhbiBwZXJmb3JtIGFwaSBjYWxscyBmb3JcbiAgICogYnV0IGFsc28gaW5jbHVkZSBrZXkgd29yZCByZWdpb25zIChzdWNoIGFzIGV1cm9wZSkgdGhhdCBhcmUgc2V0cyBvZiBtdWx0aXBsZSBsb2NhdGlvbnNcbiAgICovXG4gIGNvbnN0IHNldFN1cHBvcnRlZExvY2F0aW9ucyA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICAvLyBHZXQgdGhlIGxpc3Qgb2Ygc3VwcG9ydGVkIGxvY2F0aW9ucyBmcm9tIHRoZSBsb2NhcmlvbnMuanNvbiBmaWxlXG4gICAgY29uc3QgbG9jYWxEYXRhID0gYXdhaXQgbG9hZExvY2F0aW9ucygpO1xuICAgIC8vIEZvciBlYWNoIHJlZ2lvbiBpbiBsb2NhbERhdGEsICBhbmQgdGhlIGxvY2F0aW9ucyBvZiB0aGF0IHJlZ2lvbiB0byB0aGUgc2V0IG9mIHN1cHBvcnRlZCBsb2NhdGlvbnNcbiAgICBPYmplY3Qua2V5cyhsb2NhbERhdGEpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGNvbnN0IGxvY2F0aW9uc0FycmF5ID0gbG9jYWxEYXRhW2tleV07XG4gICAgICBsb2NhdGlvbnNBcnJheS5mb3JFYWNoKChsb2NhdGlvbjogc3RyaW5nKSA9PiB7XG4gICAgICAgIC8vIEFkZCBlYWNoIHNlcnZlciB0byB0aGUgc2V0IG9mIHN1cHBvcnRlZCBsb2NhdGlvbnNcbiAgICAgICAgc3VwcG9ydGVkTG9jYXRpb25zLmFkZChsb2NhdGlvbik7XG4gICAgICB9KTtcbiAgICAgIC8vIEFkZCBlYWNoIHJlZ2lvbiBpdHNlbGYgdG8gdGhlIHNldCBvZiBzdXBwb3J0ZWQgbG9jYXRpb25zXG4gICAgICBzdXBwb3J0ZWRMb2NhdGlvbnMuYWRkKGtleSk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogU2VuZCBhIHJlcXVlc3QgdG8gdGhlIGNhcmJvbi1hd2FyZS1zZGsgQVBJLlxuICAgKiBAcGFyYW0gcm91dGUgVGhlIHJvdXRlIHRvIHNlbmQgdGhlIHJlcXVlc3QgdG8uIFdlIG1vc3RseSB1c2UgJy9lbWlzc2lvbnMvYnlsb2NhdGlvbnMnIHRvIGdldCB0aGUgZW1pc3Npb25zIGRhdGFcbiAgICogQHBhcmFtIG1ldGhvZCBUaGUgSFRUUCBtZXRob2QgdG8gdXNlLlxuICAgKiBAcGFyYW0gcGFyYW1zIFRoZSBtYXAgb2YgcGFyYW1ldGVycyB0byBzZW5kIHdpdGggdGhlIHJlcXVlc3QuXG4gICAqIEByZXR1cm5zIFRoZSByZXNwb25zZSBmcm9tIHRoZSBBUEkgb2YgYW55IHR5cGUuXG4gICAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHJlcXVlc3QgZmFpbHMgYW5kIHN0b3BzIHRoZSBleGVjdXRpb24gb2YgdGhlIG1vZGVsLlxuICAgKi9cbiAgY29uc3QgZ2V0UmVzcG9uc2UgPSBhc3luYyAocm91dGU6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcgPSAnR0VUJywgcGFyYW1zOiBhbnkgPSBudWxsKTogUHJvbWlzZTxhbnk+ID0+IHtcbiAgICBjb25zdCB1cmwgPSBuZXcgVVJMKGAke0FQSV9VUkx9JHtyb3V0ZX1gKTtcblxuICAgIC8vIE1hbnVhbGx5IHNlcmlhbGl6ZSBwYXJhbXMgdG8gbWF0Y2ggdGhlIHJlcXVpcmVkIGZvcm1hdDogJ2xvY2F0aW9uPWVhc3R1cyZsb2NhdGlvbj13ZXN0dXMmLi4uJ1xuICAgIGxldCBxdWVyeVN0cmluZyA9ICcnO1xuICAgIGlmIChwYXJhbXMpIHtcbiAgICAgIHF1ZXJ5U3RyaW5nID0gT2JqZWN0LmVudHJpZXMocGFyYW1zKS5tYXAoKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAvLyBDb252ZXJ0IGVhY2ggdmFsdWUgdG8gYSBzdHJpbmcgYmVmb3JlIGVuY29kaW5nIGFuZCByZXBlYXQgdGhlIGtleSBmb3IgZWFjaCB2YWx1ZSBpbiB0aGUgYXJyYXlcbiAgICAgICAgICByZXR1cm4gdmFsdWUubWFwKHYgPT4gYCR7ZW5jb2RlVVJJQ29tcG9uZW50KGtleSl9PSR7ZW5jb2RlVVJJQ29tcG9uZW50KFN0cmluZyh2KSl9YCkuam9pbignJicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIENvbnZlcnQgdmFsdWUgdG8gYSBzdHJpbmcgYmVmb3JlIGVuY29kaW5nIGFuZCBkaXJlY3RseSBhcHBlbmQgdG8gcXVlcnkgc3RyaW5nXG4gICAgICAgICAgcmV0dXJuIGAke2VuY29kZVVSSUNvbXBvbmVudChrZXkpfT0ke2VuY29kZVVSSUNvbXBvbmVudChTdHJpbmcodmFsdWUpKX1gO1xuICAgICAgICB9XG4gICAgICB9KS5qb2luKCcmJyk7XG4gICAgfVxuICAgIC8vdGhlIGZpbmFsIHVybCBpcyB0aGUgdXJsIG9mIHRoZSBhcGkgY2FsbCB3ZSB3aWxsIGJlIHBlcmZvcm1pbmdcbiAgICBjb25zdCBmaW5hbFVybCA9IGAke3VybH0ke3F1ZXJ5U3RyaW5nID8gJz8nICsgcXVlcnlTdHJpbmcgOiAnJ31gO1xuICAgIGNvbnNvbGUubG9nKGBTZW5kaW5nICR7bWV0aG9kfSByZXF1ZXN0IHRvICR7ZmluYWxVcmx9YCk7XG5cbiAgICBsZXQgYXR0ZW1wdHMgPSAwO1xuICAgIGNvbnN0IG1heEF0dGVtcHRzID0gMzsgLy8gSW5pdGlhbCBhdHRlbXB0ICsgMiByZXRyaWVzIGlmIHdlIGdldCBlcnJvciA1MDAgZnJvbSB0aGUgQVBJXG5cbiAgICB3aGlsZSAoYXR0ZW1wdHMgPCBtYXhBdHRlbXB0cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBheGlvcyh7XG4gICAgICAgICAgdXJsOiBmaW5hbFVybCxcbiAgICAgICAgICBtZXRob2Q6IG1ldGhvZCxcbiAgICAgICAgfSk7XG4gICAgICAgIC8vaWYgdGhlIGFwaSBjYWxsIGlzIHN1Y2Nlc3NmdWwgdGhlbiByZXR1cm4gdGhlIGRhdGFcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlLmRhdGE7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvL2lmIHdlIGdldCBhbiBlcnJvciBmcm9tIHRoZSBhcGlcbiAgICAgICAgYXR0ZW1wdHMrKztcblxuICAgICAgICAvLyBVc2UgYSB0eXBlIGd1YXJkIHRvIGNoZWNrIGlmIHRoZSBlcnJvciBpcyBhbiBBeGlvc0Vycm9yXG4gICAgICAgIGlmIChheGlvcy5pc0F4aW9zRXJyb3IoZXJyb3IpKSB7XG4gICAgICAgICAgY29uc3QgYXhpb3NFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYXhpb3NFcnJvci5tZXNzYWdlKTtcbiAgICAgICAgICAvL2lmIHdlIGdldCBlcnJvciA1MDAgdGhlbiByZXRyeSB0aGUgYXBpIGNhbGwgdXAgdG8gMiBtb3JlIHRpbWVzXG4gICAgICAgICAgaWYgKGF4aW9zRXJyb3IucmVzcG9uc2UgJiYgYXhpb3NFcnJvci5yZXNwb25zZS5zdGF0dXMgPT09IDUwMCAmJiBhdHRlbXB0cyA8IG1heEF0dGVtcHRzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgQXR0ZW1wdCAke2F0dGVtcHRzfSBmYWlsZWQgd2l0aCBzdGF0dXMgNTAwLiBSZXRyeWluZy4uLmApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygpXG4gICAgICAgICAgICB0aHJvd0Vycm9yKEVycm9yLCBheGlvc0Vycm9yLm1lc3NhZ2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBJZiBpdCdzIG5vdCBhbiBBeGlvc0Vycm9yLCBpdCBtaWdodCBiZSBzb21lIG90aGVyIGVycm9yIChsaWtlIGEgbmV0d29yayBlcnJvciwgZXRjLilcbiAgICAgICAgICB0aHJvd0Vycm9yKEVycm9yLCAnQW4gdW5leHBlY3RlZCBlcnJvciBvY2N1cnJlZCcpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSB0aGUgaW5wdXRzIHByb3ZpZGVkIGJ5IHRoZSB1c2VyIHRvIG1ha2Ugc3VyZSB0aGF0IGFsbCByZXF1aXJlZCBwYXJhbWV0ZXJzIGFyZSBwcm92aWRlZCBhbmQgYXJlIG9mIHRoZSBjb3JyZWN0IHR5cGUuXG4gICAqIEBwYXJhbSBpbnB1dHMgVGhlIGlucHV0cyBwcm92aWRlZCBieSB0aGUgdXNlci5cbiAgICogQHRocm93cyBJbnB1dFZhbGlkYXRpb25FcnJvciBpZiB0aGUgaW5wdXRzIGFyZSBpbnZhbGlkIGFuZCBzdG9wcyB0aGUgZXhlY3V0aW9uIG9mIHRoZSBtb2RlbC5cbiAgICovXG4gIGNvbnN0IHZhbGlkYXRlSW5wdXRzID0gYXN5bmMgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKCdJbnB1dCB2YWxpZGF0aW9uOiAnLCBKU09OLnN0cmluZ2lmeShwYXJhbXMsIG51bGwsIDIpKTtcbiAgICBpZiAocGFyYW1zID09PSB1bmRlZmluZWQgfHwgcGFyYW1zID09PSBudWxsIHx8IE9iamVjdC5rZXlzKHBhcmFtcykubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvd0Vycm9yKElucHV0VmFsaWRhdGlvbkVycm9yLCAnUmVxdWlyZWQgUGFyYW1ldGVycyBub3QgcHJvdmlkZWQnKTtcbiAgICB9XG5cbiAgICBhd2FpdCBzZXRTdXBwb3J0ZWRMb2NhdGlvbnMoKTsgLy8gU2V0IHRoZSBzdXBwb3J0ZWQgbG9jYXRpb25zIGJhc2VkIG9uIHRoZSBsb2NhdGlvbnMuanNvbiBmaWxlIHRvIHNlZSBpZiB0aGUgbG9jYXRpb25zIHdlIGdvdCBhcyBpbnB1dHMgYXJlIGFtb25nIHRoZW1cbiAgICB2YWxpZGF0ZVBhcmFtcygpOyAvLyBWYWxpZGF0ZSBwYXJhbXNcbiAgICBjb25zb2xlLmxvZygnVmFsaWRhdGlvbiBjb21wbGV0ZS4nKVxuICB9O1xuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSB0aGUgaW5wdXRzIHByb3ZpZGVkIGJ5IHRoZSB1c2VyIHRvIG1ha2Ugc3VyZSB0aGF0IGFsbCByZXF1aXJlZCBwYXJhbWV0ZXJzIGFyZSBwcm92aWRlZCBhbmQgYXJlIG9mIHRoZSBjb3JyZWN0IHR5cGUuXG4gICAqIEhlcmUgd2UgYXJlIHN1cmUgdGhhdCBzb21lIGlucHV0cyBoYXZlIGJlZW4gcHJvdmlkZWQgYW5kIHdlIGhhdmUgc2V0IHRoZSBzdXBwb3J0ZWQgbG9jYXRpb25zXG4gICAqIEBwYXJhbSBwYXJhbXMgVGhlIGlucHV0cyBwcm92aWRlZCBieSB0aGUgdXNlciBpbiB0aGUgaW1wbCBmaWxlXG4gICAqIEB0aHJvd3MgSW5wdXRWYWxpZGF0aW9uRXJyb3IgaWYgdGhlIGlucHV0cyBhcmUgaW52YWxpZCBhbmQgc3RvcHMgdGhlIGV4ZWN1dGlvbiBvZiB0aGUgbW9kZWwuXG4gICAqL1xuICBjb25zdCB2YWxpZGF0ZVBhcmFtcyA9ICgpID0+IHtcbiAgICAvL3ByaW50IHRoZSBwYXJhbXMgcmVjZWl2ZWQgZnJvbSB0aGUgaW1wbCBmaWxlIGZvciBkZWJ1Z2dpbmcgcHVwcm9zZXNcbiAgICAvL2NvbnNvbGUubG9nKFwiVGhlIHBhcmFtcyByZWNlaXZlZCBmcm9tIHRoZSBpbXBsOlwiLEpTT04uc3RyaW5naWZ5KHBhcmFtcykpO1xuXG4gICAgLy8gQ2hlY2sgaWYgdGhlICdhbGxvd2VkLWxvY2F0aW9ucycgcHJvcGVydHkgZXhpc3RzIGluIHRoZSBpbXBsIGZpbGVcbiAgICBpZiAocGFyYW1zICYmIHBhcmFtc1snYWxsb3dlZC1sb2NhdGlvbnMnXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb25zdCBsb2NzID0gcGFyYW1zWydhbGxvd2VkLWxvY2F0aW9ucyddO1xuICAgICAgLy8gdmFsaWRhdGUgdGhhdCB0aGUgbG9jYXRpb25zIGFyZSBjb3JlY3RcbiAgICAgIHZhbGlkYXRlTG9jYXRpb25zKGxvY3MpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHRocm93RXJyb3IoSW5wdXRWYWxpZGF0aW9uRXJyb3IsIGBSZXF1aXJlZCBQYXJhbWV0ZXIgYWxsb3dlZC1sb2NhdGlvbnMgbm90IHByb3ZpZGVkYCk7XG4gICAgfVxuICAgIC8vIENoZWNrIGlmIHRoZSAnYWxsb3dlZC10aW1lZnJhbWVzJyBwcm9wZXJ0eSBleGlzdHMgaW4gdGhlIGltcGwgZmlsZVxuICAgIGlmIChwYXJhbXMgJiYgcGFyYW1zWydhbGxvd2VkLXRpbWVmcmFtZXMnXSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb25zdCB0aW1lcyA9IHBhcmFtc1snYWxsb3dlZC10aW1lZnJhbWVzJ107XG4gICAgICAvLyB2YWxpZGF0ZSB0aGF0IHRoZSB0aW1lZnJhbWVzIGFyZSBjb3JyZWN0XG4gICAgICB2YWxpZGF0ZVRpbWVmcmFtZXModGltZXMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvd0Vycm9yKElucHV0VmFsaWRhdGlvbkVycm9yLCBgUmVxdWlyZWQgUGFyYW1ldGVyIGFsbG93ZWQtdGltZWZyYW1lcyBub3QgcHJvdmlkZWRgKTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGUgJ3NhbXBsaW5nJyBwcm9wZXJ0eSBleGlzdHMgaW4gdGhlIGltcGwgZmlsZVxuICAgIGlmIChwYXJhbXMgJiYgcGFyYW1zWydzYW1wbGluZyddICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGNvbnN0IHNhbXBsZSA9IHBhcmFtc1snc2FtcGxpbmcnXTtcbiAgICAgIC8vIEZ1cnRoZXIgcHJvY2Vzc2luZyB3aXRoIGxvY3NcbiAgICAgIGNvbnNvbGUubG9nKCdgc2FtcGxpbmdgIHByb3ZpZGVkOicsIHNhbXBsZSk7XG4gICAgICB2YWxpZGF0ZVNhbXBsaW5nKHNhbXBsZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCdTYW1wbGluZyBub3QgcHJvdmlkZWQsIGlnbm9yaW5nJyk7XG4gICAgfVxuICB9O1xuXG4gIC8qKlxuICAgKiBWYWxpZGF0ZSB0aGUgc2FtcGxpbmcgcGFyYW1ldGVyIHRvIG1ha2Ugc3VyZSB0aGF0IGl0IGlzIGEgcG9zaXRpdmUgbnVtYmVyLlxuICAgKiBAcGFyYW0gc2FtcGxpbmcgVGhlIHNhbXBsaW5nIHBhcmFtZXRlciBwcm92aWRlZCBieSB0aGUgdXNlci5cbiAgICogQHRocm93cyBJbnB1dFZhbGlkYXRpb25FcnJvciBpZiB0aGUgc2FtcGxpbmcgcGFyYW1ldGVyIGlzIGludmFsaWQgYW5kIHN0b3BzIHRoZSBleGVjdXRpb24gb2YgdGhlIG1vZGVsLlxuICAgKiBAcmV0dXJucyB2b2lkXG4gICAqL1xuICBjb25zdCB2YWxpZGF0ZVNhbXBsaW5nID0gKHNhbXBsZTogYW55KTogdm9pZCA9PiB7XG4gICAgLy8gQ2hlY2sgaWYgc2FtcGxpbmcgaXMgYSBwb3NpdGl2ZSBudW1iZXIgIGFuZCBwb3B1bGF0ZSB0aGUgZ2xvYmFsIHBhcmFtcyBoYXNTYW1wbGluZyBhbmQgc2FtcGxpbmdcbiAgICBoYXNTYW1wbGluZyA9IHNhbXBsZSA+IDA7XG4gICAgc2FtcGxpbmcgPSBzYW1wbGU7XG5cbiAgICBpZiAoIWhhc1NhbXBsaW5nIHx8IHR5cGVvZiBzYW1wbGluZyAhPT0gJ251bWJlcicgfHwgc2FtcGxpbmcgPD0gMCkge1xuICAgICAgY29uc29sZS53YXJuKCdgc2FtcGxpbmdgIHByb3ZpZGVkIGJ1dCBub3QgYSBwb3NpdGl2ZSBudW1iZXIuIElnbm9yaW5nIGBzYW1wbGluZ2AuJyk7XG4gICAgfVxuICB9O1xuXG4gIC8qKlxuICAqIFZhbGlkYXRlIHRoZSBhbGxvd2VkLWxvY2F0aW9ucyBwYXJhbWV0ZXIgdG8gbWFrZSBzdXJlIHRoYXQgaXQgaXMgYW4gYXJyYXkgb2YgbG9jYXRpb25zXG4gICogYW5kIHRoYXQgdGhvc2UgbG9jYXRpb25zIGFyZSBzdXBwb3J0ZWRcbiAgKiBAcGFyYW0gbG9jcyBUaGUgYXJyYXkgb2YgYWxsb3dlZCBsb2NhdGlvbnMgcHJvdmlkZWQgYnkgdGhlIHVzZXIgaW4gdGhlIGltcGxcbiAgKiBAdGhyb3dzIElucHV0VmFsaWRhdGlvbkVycm9yIGlmIHRoZSBhbGxvd2VkIGxvY2F0aW9ucyBwYXJhbWV0ZXIgaXMgaW52YWxpZCBvciBzb21lIG9mIHRoZSBsb2NhdGlvbnMgYXJlIHVuc3VwcG9ydGVkIGFuZCBzdG9wcyB0aGUgZXhlY3V0aW9uIG9mIHRoZSBtb2RlbC5cbiAgKiBAcmV0dXJucyB2b2lkXG4gICovXG4gIGNvbnN0IHZhbGlkYXRlTG9jYXRpb25zID0gKGxvY3M6IGFueSk6IHZvaWQgPT4ge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShsb2NzKSB8fCBsb2NzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3dFcnJvcihJbnB1dFZhbGlkYXRpb25FcnJvciwgYFJlcXVpcmVkIFBhcmFtZXRlciAnYWxsb3dlZC1sb2NhdGlvbnMnIGlzIGVtcHR5YCk7XG4gICAgfVxuXG4gICAgbG9jcy5mb3JFYWNoKChsb2NhdGlvbjogc3RyaW5nKSA9PiB7XG4gICAgICAvL2NoZWNrIHRoYXQgdGhlIGxvY2F0aW9ucyBpbiB0aGUgaW1wbCBhcmUgc29tZSBvZiB0aGUgc3VwcG9ydGVkIGxvY2F0aW9uc1xuICAgICAgaWYgKCFzdXBwb3J0ZWRMb2NhdGlvbnMuaGFzKGxvY2F0aW9uKSkge1xuICAgICAgICB0aHJvd0Vycm9yKElucHV0VmFsaWRhdGlvbkVycm9yLCBgTG9jYXRpb24gJHtsb2NhdGlvbn0gaXMgbm90IHN1cHBvcnRlZGApO1xuICAgICAgfVxuICAgICAgYWxsb3dlZExvY2F0aW9ucy5hZGQobG9jYXRpb24pOyAvLyBwb3B1bGF0ZSB0aGUgZ2xvYmFsIHNldCBvZiBhbGxvd2VkTG9jYXRpb25zXG4gICAgfSk7XG4gIH07XG5cbiAgLyoqXG4gICogVmFsaWRhdGUgdGhlIGFsbG93ZWQtdGltZWZyYW1lcyBwYXJhbWV0ZXIgdG8gbWFrZSBzdXJlIHRoYXQgaXQgaXMgYW4gYXJyYXkgb2YgdGltZWZyYW1lc1xuICAqIGFuZCB0aGF0IHRob3NlIHRpbWVmcmFtZXMgYXJlIHZhbGlkXG4gICogQHBhcmFtIHRpbWVmcmFtZXMgVGhlIGFycmF5IG9mIGFsbG93ZWQgdGltZWZyYW1lcyBwcm92aWRlZCBieSB0aGUgdXNlciBpbiB0aGUgaW1wbFxuICAqIEB0aHJvd3MgSW5wdXRWYWxpZGF0aW9uRXJyb3IgaWYgdGhlIGFsbG93ZWQgdGltZWZyYW1lcyBwYXJhbWV0ZXIgaXMgaW52YWxpZCBvciBzb21lIG9mIHRoZSB0aW1lZnJhbWVzIGFyZSBpbnZhbGlkIGFuZCBzdG9wcyB0aGUgZXhlY3V0aW9uIG9mIHRoZSBtb2RlbC5cbiAgKiBAcmV0dXJucyB2b2lkXG4gICovXG4gIGNvbnN0IHZhbGlkYXRlVGltZWZyYW1lcyA9ICh0aW1lZnJhbWVzOiBhbnkpOiB2b2lkID0+IHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkodGltZWZyYW1lcykgfHwgdGltZWZyYW1lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93RXJyb3IoSW5wdXRWYWxpZGF0aW9uRXJyb3IsXG4gICAgICAgIGBSZXF1aXJlZCBQYXJhbWV0ZXIgYWxsb3dlZC10aW1lZnJhbWVzIGlzIGVtcHR5YCk7XG4gICAgfVxuXG4gICAgLy8gRm9yIGVhY2ggdGltZWZyYW1lIHByb3ZpZGVkLCBjaGVjayBpZiBpdCBpcyB2YWxpZCBhbmQgYWRkIGl0IHRvIHRoZSBzZXQgb2YgYWxsb3dlZCB0aW1lZnJhbWVzXG4gICAgdGltZWZyYW1lcy5mb3JFYWNoKCh0aW1lZnJhbWU6IHN0cmluZykgPT4ge1xuICAgICAgLy8gRm9yIGVhY2ggdGltZWZyYW1lIHByb3ZpZGVkLCBjaGVjayBpZiBpdCBpcyB2YWxpZFxuICAgICAgY29uc3QgW2Zyb20sIHRvXSA9IHRpbWVmcmFtZS5zcGxpdCgnIC0gJyk7XG4gICAgICBpZiAoZnJvbSA9PT0gdW5kZWZpbmVkIHx8IHRvID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3dFcnJvcihJbnB1dFZhbGlkYXRpb25FcnJvcixcbiAgICAgICAgICBgVGltZWZyYW1lICR7dGltZWZyYW1lfSBpcyBpbnZhbGlkYCk7XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIGlmIHRoZSBzdGFydCBhbmQgZW5kIHRpbWVzIGFyZSB2YWxpZCBkYXRlc1xuICAgICAgaWYgKGlzTmFOKERhdGUucGFyc2UoZnJvbSkpIHx8IGlzTmFOKERhdGUucGFyc2UodG8pKSkge1xuICAgICAgICB0aHJvd0Vycm9yKElucHV0VmFsaWRhdGlvbkVycm9yLFxuICAgICAgICAgIGBUaW1lZnJhbWUgJHt0aW1lZnJhbWV9IGlzIGludmFsaWRgKTtcbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2sgaWYgc3RhcnQgaXMgYmVmb3JlIGVuZFxuICAgICAgaWYgKGZyb20gPj0gdG8pIHtcbiAgICAgICAgdGhyb3dFcnJvcihJbnB1dFZhbGlkYXRpb25FcnJvcixcbiAgICAgICAgICBgU3RhcnQgdGltZSAke2Zyb219IG11c3QgYmUgYmVmb3JlIGVuZCB0aW1lICR7dG99YCk7XG4gICAgICB9XG4gICAgICBhbGxvd2VkVGltZWZyYW1lcy5hZGQoeyAgLy9hZGQgdGhpcyB2YWxpZCB0aW1lZnJhbWUgdG8gdGhlIGdsb2JhbCBzZXQgYWxsb3dlZFRpbWVmcmFtZXNcbiAgICAgICAgZnJvbTogZnJvbSxcbiAgICAgICAgdG86IHRvXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiB0aGlzIGZ1bmN0aW9uIGNhbGN1bGF0ZXMgdGhlIGFsbG9jYXRpb24gb2YgdGhlIHNhbXBsZXMgdG8gdGhlIHRpbWVmcmFtZXNcbiAgICogdGhlcmUgbXVzdCBiZSBhdCBsZWFzdCBvbmUgc2FtcGxlIHBlciB0aW1lZnJhbWVcbiAgICogaWYgc2FtcGxlcyA8IG51bWJlciBvZiB0aW1lZnJhbWVzIHRoZW4gYW4gZXJyb3IgaXMgdGhyb3duXG4gICAqIEBwYXJhbSBzYW1wbGluZyB0aGUgbnVtYmVyIG9mIHNhbXBsZXMgbmVlZGVkXG4gICAqIEByZXR1cm5zIHRoZSBhbGxvY2F0aW9uIG9mIHRoZSBzYW1wbGVzIHRvIHRoZSB0aW1lZnJhbWVzIG1lYW5pbmcgaG93IG1hbnkgc2FtcGxlcyB3ZSBtdXN0IHNlbGVjdCBmcm9tIGVhY2ggdGltZWZyYW1lIFxuICAgKiBpbiBvcmRlciB0byBoYXZlIGEgdW5pZnJvbSBkaXN0cmlidXRpb24gb2YgdGhlIHNhbXBsZXMgXG4gICAqIChmb3IgZXhhbXBsZSBpZiBvbmUgdGltZWZyYW1lIGlzIHZlcnkgbG9uZyB3ZSB3aWxsIHNlbGVjdCBtb3JlIHNhbXBsZXMgZnJvbSBpdCB0aGFuIGZyb20gYSBzaG9ydGVyIHRpbWVmcmFtZSlcbiAgICovXG4gIGNvbnN0IGNhbGN1bGF0ZVN1YnJhbmdlQWxsb2NhdGlvbiA9IChzYW1wbGluZzogbnVtYmVyKSA9PiB7XG4gICAgLy9pZiBzYW1wbGVzIDwgbnVtYmVyIG9mIHRpbWVmcmFtZXMgdGhlbiBhbiBlcnJvciBpcyB0aHJvd25cbiAgICBjb25zdCB0aW1lZnJhbWVzQ291bnQgPSBhbGxvd2VkVGltZWZyYW1lcy5zaXplO1xuICAgIGlmIChzYW1wbGluZyA8IHRpbWVmcmFtZXNDb3VudCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiU2FtcGxpbmcgbnVtYmVyIHRvbyBzbWFsbCBmb3IgdGhlIG51bWJlciBvZiB0aW1lZnJhbWVzLlwiKTtcbiAgICB9XG5cbiAgICAvL3JldHVybnMgdGhlIGR1cmF0aW9uIG9mIGVhY2ggdGltZWZyYW1lXG4gICAgY29uc3QgZHVyYXRpb25zID0gQXJyYXkuZnJvbShhbGxvd2VkVGltZWZyYW1lcykubWFwKHRpbWVmcmFtZSA9PiB7XG4gICAgICBjb25zdCBzdGFydCA9IG5ldyBEYXRlKHRpbWVmcmFtZS5mcm9tKS5nZXRUaW1lKCk7XG4gICAgICBjb25zdCBlbmQgPSBuZXcgRGF0ZSh0aW1lZnJhbWUudG8pLmdldFRpbWUoKTtcbiAgICAgIHJldHVybiAoZW5kIC0gc3RhcnQpIC8gMTAwMDsgLy8gRHVyYXRpb24gaW4gc2Vjb25kc1xuICAgIH0pO1xuXG4gICAgLy90aGUgdG90YWwgZHVyYXRpb24gaXMgdGhlIHN1bSBvZiBhbGwgdGhlIGR1cmF0aW9uc1xuICAgIGNvbnN0IHRvdGFsRHVyYXRpb24gPSBkdXJhdGlvbnMucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCk7XG5cbiAgICAvLyBJbml0aWFsIGFsbG9jYXRpb24gb2YgMSBzYW1wbGUgcGVyIHRpbWVmcmFtZVxuICAgIGxldCBhbGxvY2F0aW9ucyA9IGR1cmF0aW9ucy5tYXAoXyA9PiAxKTtcbiAgICBsZXQgcmVtYWluaW5nU2FtcGxlcyA9IHNhbXBsaW5nIC0gdGltZWZyYW1lc0NvdW50OyAvLyBBZGp1c3QgcmVtYWluaW5nIHNhbXBsZXNcblxuICAgIC8vIFByb3BvcnRpb25hbCBhbGxvY2F0aW9uIG9mIHRoZSByZW1haW5pbmcgc2FtcGxlc1xuICAgIGlmICh0b3RhbER1cmF0aW9uID4gMCkge1xuICAgICAgY29uc3QgcmVtYWluaW5nRHVyYXRpb25zID0gZHVyYXRpb25zLm1hcChkdXJhdGlvbiA9PiBkdXJhdGlvbiAvIHRvdGFsRHVyYXRpb24gKiByZW1haW5pbmdTYW1wbGVzKTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWxsb2NhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYWxsb2NhdGlvbnNbaV0gKz0gTWF0aC5yb3VuZChyZW1haW5pbmdEdXJhdGlvbnNbaV0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlZGlzdHJpYnV0aW9uIHRvIGVuc3VyZSB0b3RhbCBtYXRjaGVzIHNhbXBsaW5nXG4gICAgbGV0IHRvdGFsQWxsb2NhdGVkID0gYWxsb2NhdGlvbnMucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCk7XG4gICAgd2hpbGUgKHRvdGFsQWxsb2NhdGVkICE9PSBzYW1wbGluZykge1xuICAgICAgaWYgKHRvdGFsQWxsb2NhdGVkID4gc2FtcGxpbmcpIHtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhbGxvY2F0aW9ucy5sZW5ndGggJiYgdG90YWxBbGxvY2F0ZWQgPiBzYW1wbGluZzsgaSsrKSB7XG4gICAgICAgICAgaWYgKGFsbG9jYXRpb25zW2ldID4gMSkge1xuICAgICAgICAgICAgYWxsb2NhdGlvbnNbaV0gLT0gMTtcbiAgICAgICAgICAgIHRvdGFsQWxsb2NhdGVkIC09IDE7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFsbG9jYXRpb25zLmxlbmd0aCAmJiB0b3RhbEFsbG9jYXRlZCA8IHNhbXBsaW5nOyBpKyspIHtcbiAgICAgICAgICBhbGxvY2F0aW9uc1tpXSArPSAxO1xuICAgICAgICAgIHRvdGFsQWxsb2NhdGVkICs9IDE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gYWxsb2NhdGlvbnM7XG4gIH1cblxuICAvKipcbiAgICogdGhpcyBmdW5jdGlvbiB0aHJvd3MgYW4gZXJyb3Igb2YgYSBzcGVjaWZpYyB0eXBlIGFuZCBtZXNzYWdlXG4gICAqIEBwYXJhbSB0eXBlIHRoZSB0eXBlIG9mIHRoZSBlcnJvclxuICAgKiBAcGFyYW0gbWVzc2FnZSB0aGUgbWVzc2FnZSBvZiB0aGUgZXJyb3JcbiAgICogQHRocm93cyB0aGUgZXJyb3Igb2YgdGhlIHNwZWNpZmljIHR5cGUgYW5kIG1lc3NhZ2VcbiAgICogQHJldHVybnMgdm9pZFxuICAgKi9cbiAgY29uc3QgdGhyb3dFcnJvciA9ICh0eXBlOiBFcnJvckNvbnN0cnVjdG9yLCBtZXNzYWdlOiBzdHJpbmcpID0+IHtcbiAgICB0aHJvdyBuZXcgdHlwZShlcnJvckJ1aWxkZXIoeyBtZXNzYWdlIH0pKTtcbiAgfVxuXG4gIC8qKlxuICAgKiB0aGlzIGZ1bmN0aW9uIGxvYWRzIHRoZSBsb2NhdGlvbnMgZnJvbSB0aGUgbG9jYXRpb25zLmpzb24gZmlsZVxuICAgKiBAcmV0dXJucyB0aGUgbG9jYXRpb25zIG9iamVjdCBmcm9tIHRoZSBsb2NhdGlvbnMuanNvbiBmaWxlXG4gICAqL1xuICBjb25zdCBsb2FkTG9jYXRpb25zID0gYXN5bmMgKCkgPT4ge1xuICAgIHRyeSB7XG4gICAgICAvL2dldCB0aGUgZGF0YSBmcm9tIHRoZSBsb2NhdGlvbnMuanNvbiBmaWxlXG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgZnNQcm9taXNlcy5yZWFkRmlsZShsb2NhdGlvbnNGaWxlUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICBjb25zdCBsb2NhdGlvbnNPYmplY3QgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgICAgcmV0dXJuIGxvY2F0aW9uc09iamVjdDtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRmFpbGVkIHRvIHJlYWQgZnJvbSBsb2NhdGlvbnMuanNvbi4gUGxlYXNlIGNoZWNrIHRoZSBmaWxlIGFuZCBpdHMgcGF0aCBhbmQgdHJ5IGFnYWluLlwiKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgKiBDYWxjdWxhdGVzIHRoZSBhdmVyYWdlIHNjb3JlIGZvciBhIGdpdmVuIGxvY2F0aW9uIG92ZXIgdGhlIGxhc3QgZGF5cyBkYXlzLlxuICAqIFxuICAqIEBwYXJhbSBkYXlzIFRoZSBudW1iZXIgb2YgZGF5cyB0byBsb29rIGJhY2sgZnJvbSB0aGUgY3VycmVudCBkYXRlLlxuICAqIEBwYXJhbSBsb2NhdGlvbiBUaGUgbG9jYXRpb24gZm9yIHdoaWNoIHRvIGNhbGN1bGF0ZSB0aGUgYXZlcmFnZSBzY29yZS5cbiAgKiBAcmV0dXJucyBUaGUgYXZlcmFnZSBzY29yZSBmb3IgdGhlIHNwZWNpZmllZCBsb2NhdGlvbiBvdmVyIHRoZSBsYXN0IGRheXMgZGF5cy5cbiAgKi9cbiAgY29uc3QgZ2V0QXZlcmFnZVNjb3JlRm9yTGFzdFhEYXlzID0gYXN5bmMgKGRheXM6IG51bWJlciwgbG9jYXRpb246IHN0cmluZyk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4gPT4ge1xuICAgIC8vIENhbGN1bGF0ZSB0aGUgc3RhcnQgZGF0ZSBieSBzdWJ0cmFjdGluZyBkYXlzIG51bWJlciBvZiBkYXlzIGZyb20gdGhlIGN1cnJlbnQgZGF0ZVxuICAgIGNvbnN0IHRvVGltZSA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgdGltZSA9IG5ldyBEYXRlKHRvVGltZS5nZXRUaW1lKCkgLSBkYXlzICogMjQgKiA2MCAqIDYwICogMTAwMCk7XG4gICAgLy9wcmludCB0aGUgc3RhcnQgYW5kIGZpbmlzaCB0aW1lXG4gICAgY29uc29sZS5sb2coJ1N0YXJ0IHRpbWUgZm9yIHRoZSBhdmVyYWdlIHNjb3JlIG9mIHRoZSBsYXN0OicsIGRheXMsICdudW1iZXIgb2YgZGF5cyBpczogJywgdGltZS50b0lTT1N0cmluZygpKTtcbiAgICBjb25zb2xlLmxvZygnRmluaXNoIHRpbWUgZm9yIHRoZSBhdmVyYWdlIHNjb3JlIG9mIHRoZSBsYXN0OicsIGRheXMsICdudW1iZXIgb2YgZGF5cyBpczogJywgdG9UaW1lLnRvSVNPU3RyaW5nKCkpO1xuICAgIC8vIFByZXBhcmUgcGFyYW1ldGVycyBmb3IgdGhlIEFQSSBjYWxsXG4gICAgY29uc3QgcGFyYW1zID0ge1xuICAgICAgbG9jYXRpb246IGxvY2F0aW9uLFxuICAgICAgdGltZTogdGltZS50b0lTT1N0cmluZygpLFxuICAgICAgdG9UaW1lOiB0b1RpbWUudG9JU09TdHJpbmcoKSxcbiAgICB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIE1ha2UgdGhlIEFQSSBjYWxsIHRvIHJldHJpZXZlIGVtaXNzaW9ucyBkYXRhIGZvciB0aGUgbGFzdCAxMCBkYXlzIGZvciB0aGUgc3BlY2lmaWVkIGxvY2F0aW9uXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdldFJlc3BvbnNlKCcvZW1pc3Npb25zL2J5bG9jYXRpb25zJywgJ0dFVCcsIHBhcmFtcyk7XG5cbiAgICAgIC8vIENoZWNrIGlmIHRoZSByZXNwb25zZSBjb250YWlucyBkYXRhXG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGF2ZXJhZ2Ugc2NvcmUgZnJvbSB0aGUgcmVzcG9uc2UgZGF0YVxuICAgICAgICBjb25zdCB0b3RhbHJhdGluZyA9IHJlc3BvbnNlLnJlZHVjZSgoYWNjOiBudW1iZXIsIGN1cnI6IHsgcmF0aW5nOiBudW1iZXIgfSkgPT4gYWNjICsgY3Vyci5yYXRpbmcsIDApO1xuICAgICAgICBjb25zdCBhdmVyYWdlcmF0aW5nID0gdG90YWxyYXRpbmcgLyByZXNwb25zZS5sZW5ndGg7XG4gICAgICAgIHJldHVybiBhdmVyYWdlcmF0aW5nO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gbm8gZGF0YSBhdmFpbGFibGUgZm9yIHRoZSBzcGVjaWZpZWQgbG9jYXRpb24gYW5kIHRpbWUgZnJhbWVcbiAgICAgICAgY29uc29sZS5sb2coJ05vIGRhdGEgYXZhaWxhYmxlIGZvciB0aGV0aGUgbGFzdCAnLCBkYXlzLCAnZGF5cyBmb3IgbG9jYXRpb246JywgbG9jYXRpb24sKTtcbiAgICAgICAgY29uc29sZS5sb2coJ1JldHVybmluZyBudWxsIHNvIHBvdGVudGlhbCBpc3N1ZSBpZiB5b3UgcGVyZm9tIGZvcmVjYXN0aW5nIGZvciB0aGlzIGxvY2F0aW9uJyk7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgIH1cbiAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byByZXRyaWV2ZSBlbWlzc2lvbnMgZGF0YTonLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cblxuICAvLyB0aGUgQ2FyYm9uQXdhcmVBZHZpc29yIHJldHVybnMgdGhlIG1ldGFkYXRhIGFuZCB0aGUgZXhlY3V0ZSBmdW5jdGlvblxuICAvLyBzbyB0aGF0IGVhbnMgdGhhdCBldmVyeSB0aW1lIHRoaXMgbW9kZWwgaXMgcnVuIHRoZSBleGVjdXRlIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkXG4gIHJldHVybiB7XG4gICAgbWV0YWRhdGEsXG4gICAgZXhlY3V0ZSxcbiAgICBnZXRBdmVyYWdlU2NvcmVGb3JMYXN0WERheXMsXG4gICAgc3VwcG9ydGVkTG9jYXRpb25zXG4gIH07XG59XG4iXX0=