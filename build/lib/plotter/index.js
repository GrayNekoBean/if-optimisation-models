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
            const outputs = (0, js_yaml_1.loadAll)(result.stdout + '\n');
            // console.log("huh")
            // console.info('Python Output:', result.stdout);
            const error = result.stderr;
            if (error) {
                throw new Error("Python Error:\n" + error);
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvbGliL3Bsb3R0ZXIvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsaURBQTBEO0FBQzFELHFDQUFzQztBQUN0Qyw2QkFBc0I7QUFLdEIsd0RBQWdEO0FBQ2hELDhDQUF5QztBQUd6QyxNQUFNLEVBQUMsb0JBQW9CLEVBQUMsR0FBRyxlQUFNLENBQUM7QUFFL0IsTUFBTSxPQUFPLEdBQUcsQ0FBQyxZQUEwQixFQUFtQixFQUFFO0lBQ3JFLE1BQU0sUUFBUSxHQUFHO1FBQ2YsSUFBSSxFQUFFLFNBQVM7S0FDaEIsQ0FBQztJQUVGOztPQUVHO0lBQ0gsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLE1BQXNCLEVBQWtCLEVBQUU7UUFDL0QsTUFBTSxlQUFlLEdBQWlCLE1BQU0sQ0FBQyxNQUFNLENBQ2pELEVBQUUsRUFDRixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQ1QsWUFBWSxDQUNiLENBQUM7UUFDRixNQUFNLE9BQU8sR0FBRyxtQkFBbUIsQ0FBQyxlQUFlLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDN0QsTUFBTSxhQUFhLEdBQVcsSUFBQSxjQUFJLEVBQUMsTUFBTSxFQUFFLEVBQUMsTUFBTSxFQUFFLENBQUMsRUFBQyxDQUFDLENBQUM7UUFDeEQsTUFBTSxPQUFPLEdBQUcsZUFBZSxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUV4RCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUM7SUFDekIsQ0FBQyxDQUFDO0lBRUY7O09BRUc7SUFDSCxNQUFNLG1CQUFtQixHQUFHLENBQUMsS0FBbUIsRUFBRSxFQUFFO1FBQ2xELE1BQU0sTUFBTSxHQUFHLE9BQUMsQ0FBQyxNQUFNLENBQUM7WUFDdEIsT0FBTyxFQUFFLE9BQUMsQ0FBQyxNQUFNLEVBQUU7U0FDcEIsQ0FBQyxDQUFDO1FBRUgsT0FBTyxJQUFBLHNCQUFRLEVBQXlCLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN6RCxDQUFDLENBQUM7SUFFRjs7OztPQUlHO0lBQ0gsTUFBTSxlQUFlLEdBQUcsQ0FBQyxLQUFhLEVBQUUsT0FBZSxFQUFFLEVBQUU7UUFDekQsSUFBSSxDQUFDO1lBQ0gsTUFBTSxDQUFDLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFakQsTUFBTSxNQUFNLEdBQTZCLElBQUEseUJBQVMsRUFBQyxVQUFVLEVBQUUsSUFBSSxFQUFFO2dCQUNuRSxLQUFLO2dCQUNMLFFBQVEsRUFBRSxNQUFNO2FBQ2pCLENBQUMsQ0FBQztZQUNILE1BQU0sT0FBTyxHQUFHLElBQUEsaUJBQU8sRUFBQyxNQUFNLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxDQUFDO1lBRTlDLHFCQUFxQjtZQUNyQixpREFBaUQ7WUFFakQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQztZQUM1QixJQUFJLEtBQUssRUFBRSxDQUFDO2dCQUNWLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDLENBQUM7WUFDN0MsQ0FBQztZQUVELE9BQU8sRUFBQyxPQUFPLEVBQUUsT0FBTyxFQUFDLENBQUM7UUFDNUIsQ0FBQztRQUFDLE9BQU8sS0FBVSxFQUFFLENBQUM7WUFDcEIsTUFBTSxJQUFJLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoRCxDQUFDO0lBQ0gsQ0FBQyxDQUFDO0lBRUYsT0FBTztRQUNMLFFBQVE7UUFDUixPQUFPO0tBQ1IsQ0FBQztBQUNKLENBQUMsQ0FBQztBQWpFVyxRQUFBLE9BQU8sV0FpRWxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtzcGF3blN5bmMsIFNwYXduU3luY1JldHVybnN9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHtsb2FkQWxsLCBkdW1wfSBmcm9tICdqcy15YW1sJztcbmltcG9ydCB7en0gZnJvbSAnem9kJztcblxuaW1wb3J0IHsgUGx1Z2luSW50ZXJmYWNlIH0gZnJvbSAnLi4vLi4vaW50ZXJmYWNlcyc7XG5pbXBvcnQge0NvbmZpZ1BhcmFtcywgUGx1Z2luUGFyYW1zfSBmcm9tICcuLi8uLi90eXBlcy9jb21tb24nO1xuXG5pbXBvcnQge3ZhbGlkYXRlfSBmcm9tICcuLi8uLi91dGlsL3ZhbGlkYXRpb25zJztcbmltcG9ydCB7RVJST1JTfSBmcm9tICcuLi8uLi91dGlsL2Vycm9ycyc7XG5cblxuY29uc3Qge0lucHV0VmFsaWRhdGlvbkVycm9yfSA9IEVSUk9SUztcblxuZXhwb3J0IGNvbnN0IFBsb3R0ZXIgPSAoZ2xvYmFsQ29uZmlnOiBDb25maWdQYXJhbXMpOiBQbHVnaW5JbnRlcmZhY2UgPT4ge1xuICBjb25zdCBtZXRhZGF0YSA9IHtcbiAgICBraW5kOiAnZXhlY3V0ZScsXG4gIH07XG5cbiAgLyoqXG4gICAqIENhbGN1bGF0ZSB0aGUgdG90YWwgZW1pc3Npb25zIGZvciBhIGxpc3Qgb2YgaW5wdXRzLlxuICAgKi9cbiAgY29uc3QgZXhlY3V0ZSA9IGFzeW5jIChpbnB1dHM6IFBsdWdpblBhcmFtc1tdKTogUHJvbWlzZTxhbnlbXT4gPT4ge1xuICAgIGNvbnN0IGlucHV0V2l0aENvbmZpZzogUGx1Z2luUGFyYW1zID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHt9LFxuICAgICAgaW5wdXRzWzBdLFxuICAgICAgZ2xvYmFsQ29uZmlnXG4gICAgKTtcbiAgICBjb25zdCBjb21tYW5kID0gdmFsaWRhdGVTaW5nbGVJbnB1dChpbnB1dFdpdGhDb25maWcpLmNvbW1hbmQ7XG4gICAgY29uc3QgaW5wdXRBc1N0cmluZzogc3RyaW5nID0gZHVtcChpbnB1dHMsIHtpbmRlbnQ6IDJ9KTtcbiAgICBjb25zdCByZXN1bHRzID0gcnVuTW9kZWxJblNoZWxsKGlucHV0QXNTdHJpbmcsIGNvbW1hbmQpO1xuXG4gICAgcmV0dXJuIHJlc3VsdHMub3V0cHV0cztcbiAgfTtcblxuICAvKipcbiAgICogQ2hlY2tzIGZvciByZXF1aXJlZCBmaWVsZHMgaW4gaW5wdXQuXG4gICAqL1xuICBjb25zdCB2YWxpZGF0ZVNpbmdsZUlucHV0ID0gKGlucHV0OiBQbHVnaW5QYXJhbXMpID0+IHtcbiAgICBjb25zdCBzY2hlbWEgPSB6Lm9iamVjdCh7XG4gICAgICBjb21tYW5kOiB6LnN0cmluZygpLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHZhbGlkYXRlPHouaW5mZXI8dHlwZW9mIHNjaGVtYT4+KHNjaGVtYSwgaW5wdXQpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBSdW5zIHRoZSBtb2RlbCBpbiBhIHNoZWxsLiBTcGF3bnMgYSBjaGlsZCBwcm9jZXNzIHRvIHJ1biBhbiBleHRlcm5hbCBJTVAsXG4gICAqIGFuIGV4ZWN1dGFibGUgd2l0aCBhIENMSSBleHBvc2luZyB0d28gbWV0aG9kczogYC0tZXhlY3V0ZWAgYW5kIGAtLW1hbmlmZXN0YC5cbiAgICogVGhlIHNoZWxsIGNvbW1hbmQgdGhlbiBjYWxscyB0aGUgYC0tY29tbWFuZGAgbWV0aG9kIHBhc3NpbmcgdmFyIG1hbmlmZXN0IGFzIHRoZSBwYXRoIHRvIHRoZSBkZXNpcmVkIG1hbmlmZXN0IGZpbGUuXG4gICAqL1xuICBjb25zdCBydW5Nb2RlbEluU2hlbGwgPSAoaW5wdXQ6IHN0cmluZywgY29tbWFuZDogc3RyaW5nKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IFtleGVjdXRhYmxlLCAuLi5hcmdzXSA9IGNvbW1hbmQuc3BsaXQoJyAnKTtcblxuICAgICAgY29uc3QgcmVzdWx0OiBTcGF3blN5bmNSZXR1cm5zPHN0cmluZz4gPSBzcGF3blN5bmMoZXhlY3V0YWJsZSwgYXJncywge1xuICAgICAgICBpbnB1dCxcbiAgICAgICAgZW5jb2Rpbmc6ICd1dGY4JyxcbiAgICAgIH0pO1xuICAgICAgY29uc3Qgb3V0cHV0cyA9IGxvYWRBbGwocmVzdWx0LnN0ZG91dCArICdcXG4nKTtcblxuICAgICAgLy8gY29uc29sZS5sb2coXCJodWhcIilcbiAgICAgIC8vIGNvbnNvbGUuaW5mbygnUHl0aG9uIE91dHB1dDonLCByZXN1bHQuc3Rkb3V0KTtcblxuICAgICAgY29uc3QgZXJyb3IgPSByZXN1bHQuc3RkZXJyO1xuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlB5dGhvbiBFcnJvcjpcXG5cIiArIGVycm9yKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtvdXRwdXRzOiBvdXRwdXRzfTtcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICB0aHJvdyBuZXcgSW5wdXRWYWxpZGF0aW9uRXJyb3IoZXJyb3IubWVzc2FnZSk7XG4gICAgfVxuICB9O1xuXG4gIHJldHVybiB7XG4gICAgbWV0YWRhdGEsXG4gICAgZXhlY3V0ZSxcbiAgfTtcbn07Il19