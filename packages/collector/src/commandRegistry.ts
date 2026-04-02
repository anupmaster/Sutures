/**
 * Command Registry — Dynamic dispatch for dashboard commands.
 * Replaces the hardcoded switch statement in EventRouter.handleCommand().
 */

export interface CommandHandler {
  name: string;
  handler(payload: Record<string, unknown>, ctx: CommandHandlerContext): void | Promise<void>;
}

export interface CommandHandlerContext {
  sendResponse(command: string, data: unknown): void;
  broadcastToDashboards(message: unknown): void;
  broadcastToAdapters(message: unknown): void;
}

export class CommandRegistry {
  private handlers = new Map<string, CommandHandler>();

  register(handler: CommandHandler): void {
    this.handlers.set(handler.name, handler);
  }

  unregister(name: string): boolean {
    return this.handlers.delete(name);
  }

  get(name: string): CommandHandler | undefined {
    return this.handlers.get(name);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  all(): CommandHandler[] {
    return [...this.handlers.values()];
  }

  names(): string[] {
    return [...this.handlers.keys()];
  }
}
