# Contributing to Cropt
First off, thank you for considering contributing to Cropt! It's people like you that make Cropt such a great tool.

## Acknowledgements
We thank our contributors for helping make Cropt even better:

[Foliotek/Croppie](https://github.com/Foliotek/Croppie)
    Originally based on Croppie, but rewritten as a modern ES6

[Filipe Laborde](https://github.com/mindflowgo/)
    - Croppie Resize handle grabbers & get()/set() for restoring zoom/image placement

## Quickstart
First, this is a community project, so the developers and contributors appreciate properly prepared contributions and help by others. Please review the code before making changes to keep with the format of the existing code.

### Pull Requests
Fork the repository on GitHub

Clone your fork locally:

```bash
git clone https://github.com/YOUR-USERNAME/cropt.git
cd cropt
npm install
```

### Coding Standards
We use TypeScript for type safety. Please run your changes and submits through Prettier before submitting PR.

```
npm run format
```

Write self-documenting code with clear variable/function names; Add comments for complex logic.

### Project Structure
cropt/
├── src/                    # Source code
│   ├── cropt.ts            # Main Cropt class
│   └── demo.ts             # Demo application
├── dist/                   # Compiled output
├── docs/                   # Documentation
├── tests/                  # Test files
├── package.json
└── README.md               # new options & methods document here!

### Building and Testing
Test your changes thoroughly. Please try to keep existing behaviour and methods so it will be backwards compatible.

```bash
npm run prepare
npm start
```

### Documentation
Keep documentation up to date with code changes

Update README.md when adding new features

Add JSDoc comments for public APIs

Update demo examples when features warrant. Create another tab in the Demo page to showcase them.

### Reporting Issues
When reporting issues, please include:
- Clear description of the problem
- Steps to reproduce the issue
- Expected behavior vs Actual behavior
- Screenshots if applicable
- Browser/OS information

### Feature Requests
We welcome feature requests! Please provide links to other croppers that showcase the feature or screenshots to help us understand. Give us the use-case so we can understand better.

And finally, consider writing the feature yourself. Use AI to help!
