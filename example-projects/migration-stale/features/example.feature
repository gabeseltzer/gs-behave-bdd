Feature: Migration Stale Fixture

   Scenario: migration fixture sanity scenario
      Given the migration stale fixture is loaded
      When activation runs
      Then the migration loop fires
