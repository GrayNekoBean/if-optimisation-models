declare const CUSTOM_ERRORS: readonly ["CliInputError", "FileNotFoundError", "ImplValidationError", "InputValidationError", "InvalidAggregationParams", "ModelInitializationError", "ModelCredentialError"];
type CustomErrors = {
    [K in (typeof CUSTOM_ERRORS)[number]]: ErrorConstructor;
};
export declare const ERRORS: CustomErrors;
export {};
