// TypeScript test fixture for rename operations
export class UserService {
  private users: Map<string, User> = new Map();

  constructor(private database: Database) {}

  async getUser(id: string): Promise<User | undefined> {
    // Check cache first
    if (this.users.has(id)) {
      return this.users.get(id);
    }

    // Fetch from database
    const user = await this.database.findUser(id);
    if (user) {
      this.users.set(id, user);
    }
    return user;
  }

  async createUser(data: CreateUserData): Promise<User> {
    const user = await this.database.createUser(data);
    this.users.set(user.id, user);
    return user;
  }

  clearCache(): void {
    this.users.clear();
  }
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface CreateUserData {
  name: string;
  email: string;
}

interface Database {
  findUser(id: string): Promise<User | undefined>;
  createUser(data: CreateUserData): Promise<User>;
}
