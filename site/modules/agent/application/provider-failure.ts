export class AgentProviderError extends Error {
  constructor(readonly category: string, readonly retryable: boolean, message = "The agent provider request failed.") {
    super(message);
    this.name = "AgentProviderError";
  }
}
