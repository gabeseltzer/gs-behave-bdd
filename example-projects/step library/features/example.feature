Feature: Library Steps Example
  Demonstrates the use of step definitions imported from a library

  Scenario: Using library steps
    Given there is a calculator
    When I add 2 and 3
    Then the result should be 5

  Scenario: Another library step example
    Given there is a calculator
    When I add 10 and 20
    Then the result should be 30
