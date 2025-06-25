// Test file for rename_symbol functionality

interface Person {
  name: string;
  age: number;
}

function greetPerson(person: Person): string {
  return `Hello, ${person.name}! You are ${person.age} years old.`;
}

function createPerson(name: string, age: number): Person {
  return { name, age };
}

const alice: Person = createPerson('Alice', 30);
const bob: Person = { name: 'Bob', age: 25 };

console.log(greetPerson(alice));
console.log(greetPerson(bob));

// Another usage of Person
function isAdult(person: Person): boolean {
  return person.age >= 18;
}

console.log(isAdult(alice)); // true
console.log(isAdult(bob)); // true

// Try renaming:
// 1. "Person" interface (line 3) -> should rename all occurrences
// 2. "greetPerson" function (line 8) -> should rename function definition and calls
// 3. "person" parameter (line 8) -> should rename only within function scope
// 4. "alice" variable (line 16) -> should rename all references to alice
