export interface User {
  id: number;
  name: string;
  email: string;
}

export function createUser(name: string, email: string): User {
  return {
    id: Math.floor(Math.random() * 1000),
    name,
    email,
  };
}

export function getUserById(users: User[], id: number): User | undefined {
  return users.find((user) => user.id === id);
}

const exampleUser = createUser('Alice', 'alice@example.com');
console.log(getUserById([exampleUser], exampleUser.id));
