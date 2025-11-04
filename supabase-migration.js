// Supabase configuration
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0b3l4ZXZubGNzZ3dwYXJsanV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxODYwMzcsImV4cCI6MjA3Nzc2MjAzN30.cY1_AtjTZ6tu4CJglDooh9pNErKGHLEbTy0fSX368vc'
const SUPABASE_URL = 'https://itoyxevnlcsgwparljuz.supabase.co'
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Migration utility
async function migrateToSupabase() {
    try {
        // 1. Get all data from localStorage
        const boards = JSON.parse(localStorage.getItem('career-plan-boards') || '[]');
        const currentBoardId = localStorage.getItem('career-plan-current-board');
        
        // 2. Migrate each board to Supabase
        for (const board of boards) {
            // Transform the board data to match Supabase schema
            const supabaseBoard = {
                id: board.id,
                name: board.name,
                created_at: board.createdAt,
                updated_at: new Date().toISOString()
            };
            
            // Insert board
            const { data: boardData, error: boardError } = await supabase
                .from('boards')
                .upsert(supabaseBoard)
                .select()
                .single();
                
            if (boardError) {
                console.error('Error migrating board:', boardError);
                continue;
            }
            
            // Get tasks for this board
            const tasks = board.tasks || [];
            
            // Insert tasks
            for (const task of tasks) {
                // Transform task data to match Supabase schema
                const supabaseTask = {
                    id: task.id,
                    board_id: boardData.id,
                    title: task.title,
                    status: task.status,
                    epic: task.epic,
                    details: task.details,
                    start_date: task.startDate,
                    due_date: task.dueDate,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                const { error: taskError } = await supabase
                    .from('tasks')
                    .upsert(supabaseTask);
                    
                if (taskError) {
                    console.error('Error migrating task:', taskError);
                    continue;
                }
                
                // Insert dependencies if any
                if (task.dependencies && task.dependencies.length > 0) {
                    const dependencies = task.dependencies.map(depId => ({
                        task_id: task.id,
                        dependency_id: depId
                    }));
                    
                    const { error: depError } = await supabase
                        .from('task_dependencies')
                        .upsert(dependencies);
                        
                    if (depError) {
                        console.error('Error migrating dependencies:', depError);
                    }
                }
            }
        }
        
        // 3. Verify migration
        const { data: migratedBoards, error: verifyError } = await supabase
            .from('boards')
            .select('*');
            
        if (verifyError) {
            console.error('Error verifying migration:', verifyError);
            return false;
        }
        
        if (migratedBoards.length === boards.length) {
            console.log('Migration completed successfully!');
            // Optionally, clear localStorage after successful migration
            // localStorage.clear();
            return true;
        } else {
            console.error('Migration verification failed: Board count mismatch');
            return false;
        }
        
    } catch (error) {
        console.error('Migration failed:', error);
        return false;
    }
}

// Updated storage functions for Supabase
async function saveBoardsToStorage(boardsArray) {
    try {
        for (const board of boardsArray) {
            const { error } = await supabase
                .from('boards')
                .upsert(board);
            if (error) throw error;
        }
    } catch (e) {
        console.error('Error saving boards:', e);
    }
}

async function loadBoardsFromStorage() {
    try {
        // Get boards with their tasks
        const { data: boards, error: boardError } = await supabase
            .from('boards')
            .select(`
                *,
                tasks (
                    *
                )
            `);
            
        if (boardError) throw boardError;
        
        // Get all task dependencies
        const { data: dependencies, error: depError } = await supabase
            .from('task_dependencies')
            .select('*');
            
        if (depError) throw depError;
        
        // Transform the data back to the application format
        const transformedBoards = boards.map(board => ({
            id: board.id,
            name: board.name,
            createdAt: board.created_at,
            tasks: (board.tasks || []).map(task => ({
                id: task.id,
                title: task.title,
                status: task.status,
                epic: task.epic,
                details: task.details,
                startDate: task.start_date,
                dueDate: task.due_date,
                dependencies: dependencies
                    .filter(dep => dep.task_id === task.id)
                    .map(dep => dep.dependency_id)
            }))
        }));
        
        return transformedBoards;
    } catch (e) {
        console.error('Error loading boards:', e);
        return [];
    }
}

async function saveCurrentBoard(boards, tasks) {
    const currentBoardId = getCurrentBoardId();
    if (!currentBoardId) return;
    
    try {
        // Update tasks
        for (const task of tasks) {
            const { error } = await supabase
                .from('tasks')
                .upsert({
                    ...task,
                    board_id: currentBoardId
                });
            if (error) throw error;
        }
        
        // Update dependencies
        // First, remove all existing dependencies for this board's tasks
        const { error: deleteError } = await supabase
            .from('task_dependencies')
            .delete()
            .eq('board_id', currentBoardId);
            
        if (deleteError) throw deleteError;
        
        // Then add current dependencies
        for (const task of tasks) {
            if (task.dependencies?.length) {
                const deps = task.dependencies.map(depId => ({
                    task_id: task.id,
                    dependency_id: depId,
                    board_id: currentBoardId
                }));
                
                const { error } = await supabase
                    .from('task_dependencies')
                    .upsert(deps);
                    
                if (error) throw error;
            }
        }
    } catch (e) {
        console.error('Error saving current board:', e);
    }
}