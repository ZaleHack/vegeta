export async function createConnection() {
  return {
    async query() {
      return [[], []];
    },
    async end() {}
  };
}

export function createPool() {
  return {
    async getConnection() {
      return {
        release() {}
      };
    },
    async execute() {
      return [[], []];
    },
    async query() {
      return [[], []];
    }
  };
}

export default {
  createConnection,
  createPool
};
