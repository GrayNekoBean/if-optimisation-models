"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERRORS = void 0;
const CUSTOM_ERRORS = [
    'CliInputError',
    'FileNotFoundError',
    'ImplValidationError',
    'InputValidationError',
    'InvalidAggregationParams',
    'ModelInitializationError',
    'ModelCredentialError',
];
exports.ERRORS = CUSTOM_ERRORS.reduce((acc, className) => {
    acc = {
        ...acc,
        [className]: class extends Error {
            constructor(message) {
                super(message);
                this.name = this.constructor.name;
            }
        },
    };
    return acc;
}, {});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXJyb3JzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3V0aWwvZXJyb3JzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLE1BQU0sYUFBYSxHQUFHO0lBQ3BCLGVBQWU7SUFDZixtQkFBbUI7SUFDbkIscUJBQXFCO0lBQ3JCLHNCQUFzQjtJQUN0QiwwQkFBMEI7SUFDMUIsMEJBQTBCO0lBQzFCLHNCQUFzQjtDQUNkLENBQUM7QUFNRSxRQUFBLE1BQU0sR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRSxFQUFFO0lBQzVELEdBQUcsR0FBRztRQUNKLEdBQUcsR0FBRztRQUNOLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBTSxTQUFRLEtBQUs7WUFDOUIsWUFBWSxPQUFlO2dCQUN6QixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ2YsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQztZQUNwQyxDQUFDO1NBQ0Y7S0FDRixDQUFDO0lBRUYsT0FBTyxHQUFHLENBQUM7QUFDYixDQUFDLEVBQUUsRUFBa0IsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgQ1VTVE9NX0VSUk9SUyA9IFtcbiAgJ0NsaUlucHV0RXJyb3InLFxuICAnRmlsZU5vdEZvdW5kRXJyb3InLFxuICAnSW1wbFZhbGlkYXRpb25FcnJvcicsXG4gICdJbnB1dFZhbGlkYXRpb25FcnJvcicsXG4gICdJbnZhbGlkQWdncmVnYXRpb25QYXJhbXMnLFxuICAnTW9kZWxJbml0aWFsaXphdGlvbkVycm9yJyxcbiAgJ01vZGVsQ3JlZGVudGlhbEVycm9yJyxcbl0gYXMgY29uc3Q7XG5cbnR5cGUgQ3VzdG9tRXJyb3JzID0ge1xuICBbSyBpbiAodHlwZW9mIENVU1RPTV9FUlJPUlMpW251bWJlcl1dOiBFcnJvckNvbnN0cnVjdG9yO1xufTtcblxuZXhwb3J0IGNvbnN0IEVSUk9SUyA9IENVU1RPTV9FUlJPUlMucmVkdWNlKChhY2MsIGNsYXNzTmFtZSkgPT4ge1xuICBhY2MgPSB7XG4gICAgLi4uYWNjLFxuICAgIFtjbGFzc05hbWVdOiBjbGFzcyBleHRlbmRzIEVycm9yIHtcbiAgICAgIGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZykge1xuICAgICAgICBzdXBlcihtZXNzYWdlKTtcbiAgICAgICAgdGhpcy5uYW1lID0gdGhpcy5jb25zdHJ1Y3Rvci5uYW1lO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG5cbiAgcmV0dXJuIGFjYztcbn0sIHt9IGFzIEN1c3RvbUVycm9ycyk7XG4iXX0=