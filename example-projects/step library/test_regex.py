import sys
import os

try:
    from behave import step_registry
    from behave import runner_util
    
    sys.path.insert(0, '.')
    step_dir = os.path.abspath('./steps')
    if os.path.exists(step_dir):
        runner_util.load_step_modules([step_dir])
    
    registry = step_registry.registry
    
    # Debug: print matcher details and all attributes
    for step_type in ['when']:
        if step_type in registry.steps:
            for matcher in registry.steps[step_type]:
                print(f'Pattern: {matcher.pattern}')
                print(f'Type: {type(matcher)}')
                print(f'Attributes: {dir(matcher)}')
                print(f'Has regex: {hasattr(matcher, "regex")}')
                print(f'Has regex_pattern: {hasattr(matcher, "regex_pattern")}')
                print(f'Has _regex: {hasattr(matcher, "_regex")}')
                
                # Try to get the compiled regex
                if hasattr(matcher, 'regex'):
                    print(f'Regex pattern: {matcher.regex.pattern}')
                elif hasattr(matcher, '_regex'):
                    print(f'_Regex pattern: {matcher._regex.pattern}')
                elif hasattr(matcher, 'regex_pattern'):
                    print(f'Regex_pattern: {matcher.regex_pattern}')
                
                print()
except Exception as e:
    import traceback
    traceback.print_exc()
