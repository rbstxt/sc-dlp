interface Environment {
  canAccessScratchAPI: boolean;
  headers: Record<string, string>;
}

const environment: Environment = {
  /**
   * Whether the module is able to directly talk to api.scratch.mit.edu or if a middleman
   * is required due to CORS.
   */
  canAccessScratchAPI: false,

  /**
   * Headers used when fetching remote APIs.
   */
  headers: {}
};

export default environment;
