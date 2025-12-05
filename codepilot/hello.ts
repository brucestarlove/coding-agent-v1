/**
 * Returns a greeting message for the given name
 * @param name - The name to greet
 * @returns A personalized greeting message
 */
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

/**
 * Returns a default greeting message
 * @returns A default greeting message
 */
export function greetDefault(): string {
  return "Hello, World!";
}

// Example usage
if (require.main === module) {
  console.log(greetDefault());
  console.log(greet("TypeScript"));
}
