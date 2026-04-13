# Step Library Example Project

This example demonstrates how to organize step definitions using a shared library pattern. This is useful when you have:

- Common steps used across multiple feature files
- Reusable step logic in a separate package or folder
- A need to import step definitions from outside the `steps/` folder

## Structure

```text
step library/
├── features/
│   └── example.feature          # Feature file using library steps
├── steps/
│   └── example_steps.py         # Local steps file that imports from library
├── lib/
│   └── library_steps.py         # Library with shared step definitions
└── README.md
```

## How It Works

1. **Feature File** (`features/example.feature`): Defines test scenarios using Gherkin
2. **Local Steps** (`steps/example_steps.py`): A Python file that imports step definitions from the library
3. **Library Steps** (`lib/library_steps.py`): Contains reusable step definitions defined with `@given`, `@when`, `@then` decorators

## Running Tests

With Behave BDD extension:

- Open this project in VS Code
- View the step library example in the Test Explorer
- Hover over steps to see they're recognized from the library (no "step not found" warnings)
- Click "Run" to execute the feature

## Key Features Demonstrated

- ✅ Steps defined in library folder (`lib/`) are recognized in feature files
- ✅ Step navigation ("Go to Step Definition") works with library steps
- ✅ No "step not found" diagnostics for library steps
- ✅ IDE autocomplete suggests library steps in feature files

## Notes

- The library file (`lib/library_steps.py`) is treated as a library, not a regular steps file
- Import statements can use `from lib.library_steps import *` or absolute imports
- The file structure is flexible - you can use any folder name for your library
