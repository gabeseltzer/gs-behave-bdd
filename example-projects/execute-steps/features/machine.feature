Feature: Machine operation

  Scenario: Run the machine end to end
    Given the machine is ready
    When the machine runs
    Then the machine reports success
