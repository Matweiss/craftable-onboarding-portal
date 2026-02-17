-- Add help_url column to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS help_url TEXT;

-- Update tasks with learning center links
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/ops-group-mappings' WHERE task_name = 'Ops Group & GL Mappings';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/get-the-app' WHERE task_name = 'App Install';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/invoice-ai' WHERE task_name = 'Mapping New Invoices';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/creating-inventory-storages' WHERE task_name = 'Build Storage Areas';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/setting-bins' WHERE task_name = 'Assign Bins';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/creating-prep-items-and-batches' WHERE task_name = 'Build Prep Items';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/inventory-app' WHERE task_name = 'Prep for First Inventory';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/managing-pars-from-item-manager' WHERE task_name = 'Set Par Levels';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/managing-depletions' WHERE task_name = 'Train Staff on Depletions';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/setting-up-par-levels' WHERE task_name = 'Place First Order';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/creating-pours' WHERE task_name = 'Build Pours';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/creating-recipes-and-subrecipes' WHERE task_name = 'Build Recipes';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/pos-item-mapping' WHERE task_name = 'POS Mappings';
UPDATE tasks SET help_url = 'https://help.craftable.com/learning/pos-modifier-mapping' WHERE task_name = 'Map Modifiers';
