# Python test fixture for rename operations
class Calculator:
    """A simple calculator class for testing rename operations."""
    
    def __init__(self):
        self.history = []
        self.last_result = 0
    
    def add(self, a, b):
        """Add two numbers and store the result."""
        result = a + b
        self.last_result = result
        self.history.append(f"add({a}, {b}) = {result}")
        return result
    
    def multiply(self, a, b):
        """Multiply two numbers and store the result."""
        result = a * b
        self.last_result = result
        self.history.append(f"multiply({a}, {b}) = {result}")
        return result
    
    def get_history(self):
        """Return the calculation history."""
        return self.history
    
    def clear_history(self):
        """Clear the calculation history."""
        self.history = []
        self.last_result = 0


# Usage example
if __name__ == "__main__":
    calc = Calculator()
    print(calc.add(5, 3))
    print(calc.multiply(4, 7))
    print(calc.get_history())
    calc.clear_history()