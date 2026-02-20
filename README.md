 Refactoring the 500-Line “Spaghetti Code”

<< _spag.js>>

This code Contains 500-line procedural function that:
has duplicated logic
Mixes business rules with database calls
Has no separation of concerns

######################################################

<< fixed_spaghetti.js >>


Refactored into:
Clean, modular classes
Clear separation of responsibilities
Testable services with injected dependencies
Ensures no method exceeds 30–40 lines after refactoring.
