"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Plotter = void 0;
const child_process_1 = require("child_process");
const js_yaml_1 = require("js-yaml");
const zod_1 = require("zod");
const validations_1 = require("../../util/validations");
const errors_1 = require("../../util/errors");
const { InputValidationError } = errors_1.ERRORS;
const Plotter = (globalConfig) => {
    const metadata = {
        kind: 'execute',
    };
    /**
     * Calculate the total emissions for a list of inputs.
     */
    const execute = async (inputs) => {
        const inputWithConfig = Object.assign({}, inputs[0], globalConfig);
        const command = validateSingleInput(inputWithConfig).command;
        const inputAsString = (0, js_yaml_1.dump)(inputs, { indent: 2 });
        const results = runModelInShell(inputAsString, command);
        return results.outputs;
    };
    /**
     * Checks for required fields in input.
     */
    const validateSingleInput = (input) => {
        const schema = zod_1.z.object({
            command: zod_1.z.string(),
        });
        return (0, validations_1.validate)(schema, input);
    };
    /**
     * Runs the model in a shell. Spawns a child process to run an external IMP,
     * an executable with a CLI exposing two methods: `--execute` and `--manifest`.
     * The shell command then calls the `--command` method passing var manifest as the path to the desired manifest file.
     */
    const runModelInShell = (input, command) => {
        try {
            const [executable, ...args] = command.split(' ');
            const result = (0, child_process_1.spawnSync)(executable, args, {
                input,
                encoding: 'utf8',
            });
            const outputs = (0, js_yaml_1.loadAll)(result.stdout);
            return { outputs: outputs };
        }
        catch (error) {
            throw new InputValidationError(error.message);
        }
    };
    return {
        metadata,
        execute,
    };
};
exports.Plotter = Plotter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbGliL3Bsb3R0ZXIvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsaURBQTBEO0FBQzFELHFDQUFzQztBQUN0Qyw2QkFBc0I7QUFLdEIsd0RBQWdEO0FBQ2hELDhDQUF5QztBQUd6QyxNQUFNLEVBQUMsb0JBQW9CLEVBQUMsR0FBRyxlQUFNLENBQUM7QUFFL0IsTUFBTSxPQUFPLEdBQUcsQ0FBQyxZQUEwQixFQUFtQixFQUFFO0lBQ3JFLE1BQU0sUUFBUSxHQUFHO1FBQ2YsSUFBSSxFQUFFLFNBQVM7S0FDaEIsQ0FBQztJQUVGOztPQUVHO0lBQ0gsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLE1BQXNCLEVBQWtCLEVBQUU7UUFDL0QsTUFBTSxlQUFlLEdBQWlCLE1BQU0sQ0FBQyxNQUFNLENBQ2pELEVBQUUsRUFDRixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQ1QsWUFBWSxDQUNiLENBQUM7UUFDRixNQUFNLE9BQU8sR0FBRyxtQkFBbUIsQ0FBQyxlQUFlLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDN0QsTUFBTSxhQUFhLEdBQVcsSUFBQSxjQUFJLEVBQUMsTUFBTSxFQUFFLEVBQUMsTUFBTSxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUM7UUFDeEQsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUV4RCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUM7SUFDekIsQ0FBQyxDQUFDO0lBRUY7O09BRUc7SUFDSCxNQUFNLG1CQUFtQixHQUFHLENBQUMsS0FBbUIsRUFBRSxFQUFFO1FBQ2xELE1BQU0sTUFBTSxHQUFHLE9BQUMsQ0FBQyxNQUFNLENBQUM7WUFDdEIsT0FBTyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUU7U0FDcEIsQ0FBQyxDQUFDO1FBRUgsT0FBTyxJQUFBLHNCQUFRLEVBQXlCLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN6RCxDQUFDLENBQUM7SUFFRjs7OztPQUlHO0lBQ0gsTUFBTSxlQUFlLEdBQUcsQ0FBQyxLQUFhLEVBQUUsT0FBZSxFQUFFLEVBQUU7UUFDekQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxDQUFDLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFakQsTUFBTSxNQUFNLEdBQTZCLElBQUEseUJBQVMsRUFBQyxVQUFVLEVBQUUsSUFBSSxFQUFFO2dCQUNuRSxLQUFLO2dCQUNMLFFBQVEsRUFBRSxNQUFNO2FBQ2pCLENBQUMsQ0FBQztZQUNILE1BQU0sT0FBTyxHQUFHLElBQUEsaUJBQU8sRUFBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFdkMsT0FBTyxFQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUMsQ0FBQztRQUM1QixDQUFDO1FBQUMsT0FBTyxLQUFVLEVBQUUsQ0FBQztZQUNwQixNQUFNLElBQUksb0JBQW9CLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hELENBQUM7SUFDSCxDQUFDLENBQUM7SUFFRixPQUFPO1FBQ0wsUUFBUTtRQUNSLE9BQU87S0FDUixDQUFDO0FBQ0osQ0FBQyxDQUFDO0FBekRXLFFBQUEsT0FBTyxXQXlEbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge3NwYXduU3luYywgU3Bhd25TeW5jUmV0dXJuc30gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQge2xvYWRBbGwsIGR1bXB9IGZyb20gJ2pzLXlhbWwnO1xuaW1wb3J0IHt6fSBmcm9tICd6b2QnO1xuXG5pbXBvcnQgeyBQbHVnaW5JbnRlcmZhY2UgfSBmcm9tICcuLi8uLi9pbnRlcmZhY2VzJztcbmltcG9ydCB7Q29uZmlnUGFyYW1zLCBQbHVnaW5QYXJhbXN9IGZyb20gJy4uLy4uL3R5cGVzL2NvbW1vbic7XG5cbmltcG9ydCB7dmFsaWRhdGV9IGZyb20gJy4uLy4uL3V0aWwvdmFsaWRhdGlvbnMnO1xuaW1wb3J0IHtFUlJPUlN9IGZyb20gJy4uLy4uL3V0aWwvZXJyb3JzJztcblxuXG5jb25zdCB7SW5wdXRWYWxpZGF0aW9uRXJyb3J9ID0gRVJST1JTO1xuXG5leHBvcnQgY29uc3QgUGxvdHRlciA9IChnbG9iYWxDb25maWc6IENvbmZpZ1BhcmFtcyk6IFBsdWdpbkludGVyZmFjZSA9PiB7XG4gIGNvbnN0IG1ldGFkYXRhID0ge1xuICAgIGtpbmQ6ICdleGVjdXRlJyxcbiAgfTtcblxuICAvKipcbiAgICogQ2FsY3VsYXRlIHRoZSB0b3RhbCBlbWlzc2lvbnMgZm9yIGEgbGlzdCBvZiBpbnB1dHMuXG4gICAqL1xuICBjb25zdCBleGVjdXRlID0gYXN5bmMgKGlucHV0czogUGx1Z2luUGFyYW1zW10pOiBQcm9taXNlPGFueVtdPiA9PiB7XG4gICAgY29uc3QgaW5wdXRXaXRoQ29uZmlnOiBQbHVnaW5QYXJhbXMgPSBPYmplY3QuYXNzaWduKFxuICAgICAge30sXG4gICAgICBpbnB1dHNbMF0sXG4gICAgICBnbG9iYWxDb25maWdcbiAgICApO1xuICAgIGNvbnN0IGNvbW1hbmQgPSB2YWxpZGF0ZVNpbmdsZUlucHV0KGlucHV0V2l0aENvbmZpZykuY29tbWFuZDtcbiAgICBjb25zdCBpbnB1dEFzU3RyaW5nOiBzdHJpbmcgPSBkdW1wKGlucHV0cywge2luZGVudDogMn0pO1xuICAgIGNvbnN0IHJlc3VsdHMgPSBydW5Nb2RlbEluU2hlbGwoaW5wdXRBc1N0cmluZywgY29tbWFuZCk7XG5cbiAgICByZXR1cm4gcmVzdWx0cy5vdXRwdXRzO1xuICB9O1xuXG4gIC8qKlxuICAgKiBDaGVja3MgZm9yIHJlcXVpcmVkIGZpZWxkcyBpbiBpbnB1dC5cbiAgICovXG4gIGNvbnN0IHZhbGlkYXRlU2luZ2xlSW5wdXQgPSAoaW5wdXQ6IFBsdWdpblBhcmFtcykgPT4ge1xuICAgIGNvbnN0IHNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICAgIGNvbW1hbmQ6IHouc3RyaW5nKCksXG4gICAgfSk7XG5cbiAgICByZXR1cm4gdmFsaWRhdGU8ei5pbmZlcjx0eXBlb2Ygc2NoZW1hPj4oc2NoZW1hLCBpbnB1dCk7XG4gIH07XG5cbiAgLyoqXG4gICAqIFJ1bnMgdGhlIG1vZGVsIGluIGEgc2hlbGwuIFNwYXducyBhIGNoaWxkIHByb2Nlc3MgdG8gcnVuIGFuIGV4dGVybmFsIElNUCxcbiAgICogYW4gZXhlY3V0YWJsZSB3aXRoIGEgQ0xJIGV4cG9zaW5nIHR3byBtZXRob2RzOiBgLS1leGVjdXRlYCBhbmQgYC0tbWFuaWZlc3RgLlxuICAgKiBUaGUgc2hlbGwgY29tbWFuZCB0aGVuIGNhbGxzIHRoZSBgLS1jb21tYW5kYCBtZXRob2QgcGFzc2luZyB2YXIgbWFuaWZlc3QgYXMgdGhlIHBhdGggdG8gdGhlIGRlc2lyZWQgbWFuaWZlc3QgZmlsZS5cbiAgICovXG4gIGNvbnN0IHJ1bk1vZGVsSW5TaGVsbCA9IChpbnB1dDogc3RyaW5nLCBjb21tYW5kOiBzdHJpbmcpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgW2V4ZWN1dGFibGUsIC4uLmFyZ3NdID0gY29tbWFuZC5zcGxpdCgnICcpO1xuXG4gICAgICBjb25zdCByZXN1bHQ6IFNwYXduU3luY1JldHVybnM8c3RyaW5nPiA9IHNwYXduU3luYyhleGVjdXRhYmxlLCBhcmdzLCB7XG4gICAgICAgIGlucHV0LFxuICAgICAgICBlbmNvZGluZzogJ3V0ZjgnLFxuICAgICAgfSk7XG4gICAgICBjb25zdCBvdXRwdXRzID0gbG9hZEFsbChyZXN1bHQuc3Rkb3V0KTtcblxuICAgICAgcmV0dXJuIHtvdXRwdXRzOiBvdXRwdXRzfTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICB0aHJvdyBuZXcgSW5wdXRWYWxpZGF0aW9uRXJyb3IoZXJyb3IubWVzc2FnZSk7XG4gICAgfVxuICB9O1xuXG4gIHJldHVybiB7XG4gICAgbWV0YWRhdGEsXG4gICAgZXhlY3V0ZSxcbiAgfTtcbn07Il19