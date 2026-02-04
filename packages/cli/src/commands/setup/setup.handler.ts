/**
 * Setup Command Handler
 *
 * Orchestrates the setup process using individual steps.
 */

import type { IOutputService } from "../../interfaces/output.interface";
import type { IFileSystemService } from "../../interfaces/filesystem.interface";
import type { IShellService } from "../../interfaces/shell.interface";
import type { IPromptsService } from "../../interfaces/prompts.interface";
import type {
  ISetupStep,
  SetupOptions,
  SetupContext,
  SetupState,
} from "./steps/step.interface";
import { StepRunner } from "./step-runner";
import { FindProjectStep } from "./steps/find-project.step";
import { PrerequisitesStep } from "./steps/prerequisites.step";
import { EnvironmentStep } from "./steps/environment.step";
import { DatabaseStep } from "./steps/database.step";
import { StartServersStep } from "./steps/start-servers.step";
import { OpenBrowserStep } from "./steps/open-browser.step";

const API_PORT = 4000;
const WEB_PORT = 3000;

export class SetupHandler {
  private readonly runner: StepRunner;

  /**
   * Get the default setup steps.
   * Useful for extending or testing.
   */
  static getDefaultSteps(): ISetupStep[] {
    return [
      new FindProjectStep(),
      new PrerequisitesStep(),
      new EnvironmentStep(),
      new DatabaseStep(),
      new StartServersStep(),
      new OpenBrowserStep(),
    ];
  }

  /**
   * Create a setup handler.
   * @param output - Output service
   * @param filesystem - Filesystem service
   * @param shell - Shell service
   * @param prompts - Prompts service
   * @param steps - Optional custom steps (DIP: allows injection for testing)
   */
  constructor(
    private readonly output: IOutputService,
    private readonly filesystem: IFileSystemService,
    private readonly shell: IShellService,
    private readonly prompts: IPromptsService,
    steps?: ISetupStep[]
  ) {
    // Use provided steps or default (allows injection for testing)
    this.runner = new StepRunner(steps ?? SetupHandler.getDefaultSteps());
  }

  /**
   * Execute the setup command.
   */
  async execute(options: SetupOptions = {}): Promise<void> {
    // Set non-interactive mode on prompts service
    if (options.nonInteractive) {
      this.prompts.setNonInteractive(true);
    }

    // Display header
    this.output.header("Clawster Setup", "🚀");
    this.output.dim("Get Clawster up and running in minutes");
    this.output.newline();

    // Create initial context
    const state: SetupState = {
      apiPort: API_PORT,
      webPort: WEB_PORT,
    };

    const context: SetupContext = {
      projectRoot: "", // Will be set by FindProjectStep
      options,
      filesystem: this.filesystem,
      shell: this.shell,
      output: this.output,
      prompts: this.prompts,
      state,
    };

    // Run steps with step numbers
    const steps = this.runner.getSteps();
    let stepNumber = 1;

    for (const step of steps) {
      // Check if step should be skipped
      if (step.shouldSkip) {
        const shouldSkip = await step.shouldSkip(context);
        if (shouldSkip) {
          continue;
        }
      }

      // Display step header
      this.output.subheader(`Step ${stepNumber}: ${step.name}...`);
      this.output.newline();

      // Execute step
      const result = await step.execute(context);

      if (!result.success) {
        this.output.newline();
        this.output.error(`❌ ${result.message}`);
        process.exit(1);
      }

      if (result.skipReason) {
        this.output.dim(`  ${result.skipReason}`);
      }

      this.output.newline();
      stepNumber++;
    }

    // Display success message
    this.displaySuccessMessage(state);
  }

  private displaySuccessMessage(state: SetupState): void {
    this.output.success("✓ Clawster setup complete!");
    this.output.newline();

    if (!state.serversStarted) {
      this.output.log("To start the development servers:");
      this.output.cyan("  pnpm dev");
      this.output.newline();
      this.output.dim("Or start individually:");
      this.output.dim("  Terminal 1: pnpm --filter @clawster/api dev");
      this.output.dim("  Terminal 2: pnpm --filter @clawster/web dev");
      this.output.newline();
    }

    this.output.log("Access the dashboard:");
    this.output.cyan(`  http://localhost:${state.webPort}`);
    this.output.newline();

    this.output.log("Next steps:");
    this.output.dim("  1. Create your first fleet in the dashboard");
    this.output.dim("  2. Deploy OpenClaw instances to your fleet");
    this.output.dim("  3. For AWS deployment, run: pnpm cli init");
    this.output.newline();
  }
}

/**
 * Factory function for creating setup handler with services.
 * @param output - Output service
 * @param filesystem - Filesystem service
 * @param shell - Shell service
 * @param prompts - Prompts service
 * @param steps - Optional custom steps (for testing with custom steps)
 */
export function createSetupHandler(
  output: IOutputService,
  filesystem: IFileSystemService,
  shell: IShellService,
  prompts: IPromptsService,
  steps?: ISetupStep[]
): SetupHandler {
  return new SetupHandler(output, filesystem, shell, prompts, steps);
}
