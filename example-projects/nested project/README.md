# Nested Project Example

This example demonstrates using the `projectPath` setting when your behave project
is not in the root of the workspace folder.

## Directory Structure

```
nested project/          <- workspace root
  └── backend/           <- behave project root (projectPath)
      └── behave.ini
      └── features/      <- features folder (featuresPath)
          └── environment.py
          └── nested.feature
          └── steps/
              └── steps.py
```

## Settings

See `.vscode/settings.json` for the configuration that makes this work:

- `behave-vsc-gs.projectPath`: "backend"
- `behave-vsc-gs.featuresPath`: "features"
