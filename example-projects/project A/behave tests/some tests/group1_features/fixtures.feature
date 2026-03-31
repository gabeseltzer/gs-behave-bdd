Feature: Fixture Tests

   @fixture.disable_sensors
   Scenario: test with disabled sensors
      Given we have behave installed
      When we implement a successful test
      Then we will see the result

   @fixture.mock_database
   Scenario: test with mock database
      Given we have behave installed
      When we implement a successful test
      Then we will see the result

   @fixture.nonexistent_fixture
   Scenario: test with missing fixture
      Given we have behave installed
