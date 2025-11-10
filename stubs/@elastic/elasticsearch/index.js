export class Client {
  constructor() {
    this.indices = {
      async exists() {
        return false;
      },
      async create() {
        return { acknowledged: true };
      },
      async delete() {
        return { acknowledged: true };
      }
    };
  }

  async search() {
    return { hits: { hits: [] } };
  }

  async bulk() {
    return { errors: false, items: [] };
  }

  async ping() {
    return true;
  }
}

export default { Client };
