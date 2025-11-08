'use client'

import { Editor, useEditorState } from '@tiptap/react'
import '@tiptap/extension-table'
import { ArrowLeftToLine, ArrowUpToLine, ArrowRightToLine, ArrowDownToLine, Grid2x2Plus, Grid2x2X, Columns3Cog, BetweenHorizonalStart, FoldHorizontal, Hammer, MoveRight, MoveLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { 
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type TableCanCommands = Record<string, (...args: unknown[]) => boolean>
type TableChainCommand = { run?: () => void }
type TableChain = Record<string, (...args: unknown[]) => TableChainCommand | undefined>

interface TableButtonProps {
    editor: Editor
    size?: 'sm' | 'default'
    className?: string
}

const TableButton = ({ editor, size = 'sm', className = '' }: TableButtonProps) => {
    const editorState = useEditorState({
        editor,
        selector: (state: { editor: Editor }) => ({
            isTable: state.editor.isActive('table'),
            ...(() => {
                const can = state.editor.can() as unknown as TableCanCommands
                return {
                    canMergeCells: can.mergeCells?.() ?? false,
                    canSplitCell: can.splitCell?.() ?? false,
                    canDeleteColumn: can.deleteColumn?.() ?? false,
                    canDeleteRow: can.deleteRow?.() ?? false,
                    canMergeOrSplit: can.mergeOrSplit?.() ?? false,
                    canFixTables: can.fixTables?.() ?? false,
                    canGoToNextCell: can.goToNextCell?.() ?? false,
                    canGoToPreviousCell: can.goToPreviousCell?.() ?? false,
                }
            })(),
        }),
    })

    const getChain = () => (editor ? (editor.chain().focus() as unknown as TableChain) : null)
    
    const handleInsertTable = () => {
        const chain = getChain()
        chain?.insertTable?.({ 
            rows: 2, 
            cols: 2, 
            withHeaderRow: true 
        })?.run?.()
    }

    const handleAddColumnBefore = () => {
        getChain()?.addColumnBefore?.()?.run?.()
    }

    const handleAddColumnAfter = () => {
        getChain()?.addColumnAfter?.()?.run?.()
    }

    const handleAddRowBefore = () => {
        getChain()?.addRowBefore?.()?.run?.()
    }

    const handleAddRowAfter = () => {
        getChain()?.addRowAfter?.()?.run?.()
    }

    const handleDeleteColumn = () => {
        getChain()?.deleteColumn?.()?.run?.()
    }

    const handleDeleteRow = () => {
        getChain()?.deleteRow?.()?.run?.()
    }

    const handleDeleteTable = () => {
        getChain()?.deleteTable?.()?.run?.()
    }

    const handleMergeCells = () => {
        getChain()?.mergeCells?.()?.run?.()
    }

    const handleSplitCell = () => {
        getChain()?.splitCell?.()?.run?.()
    }

    const handleMergeOrSplit = () => {
        getChain()?.mergeOrSplit?.()?.run?.()
    }

    const handleToggleHeaderColumn = () => {
        getChain()?.toggleHeaderColumn?.()?.run?.()
    }

    const handleToggleHeaderRow = () => {
        getChain()?.toggleHeaderRow?.()?.run?.()
    }

    const handleToggleHeaderCell = () => {
        getChain()?.toggleHeaderCell?.()?.run?.()
    }

    const handleSetColspan = () => {
        const value = typeof window !== 'undefined' ? window.prompt('Enter colspan value', '2') : null
        if (!value) return
        const parsedValue = Number.parseInt(value, 10)
        if (Number.isNaN(parsedValue)) return
        getChain()?.setCellAttribute?.('colspan', parsedValue)?.run?.()
    }

    const handleFixTables = () => {
        getChain()?.fixTables?.()?.run?.()
    }

    const handleGoToNextCell = () => {
        getChain()?.goToNextCell?.()?.run?.()
    }

    const handleGoToPreviousCell = () => {
        getChain()?.goToPreviousCell?.()?.run?.()
    }

    // If not in a table, show insert table button (no popover)
    if (!editorState.isTable) {
        return (
            <Tooltip>
                <TooltipTrigger>
                    <Toggle
                        size={size}
                        className={className}
                        pressed={false}
                        onClick={handleInsertTable}
                    >
                        <Grid2x2Plus className="" />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Insert Table <span className='ml-2'>⌘T</span></p>
                </TooltipContent>
            </Tooltip>
        )
    }

    // If in a table, show gear icon with popover of table editing options
    return (
        <Popover>
            <PopoverTrigger>
                <Tooltip>
                    <TooltipTrigger>
                        <Toggle
                            size={size}
                            className={className}
                            pressed={editorState.isTable}
                        >
                            <Columns3Cog className="" />
                        </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Table Options</p>
                    </TooltipContent>
                </Tooltip>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
                <div className="space-y-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleAddColumnBefore}
                        className="w-full justify-start"
                    >
                        <ArrowLeftToLine className="mr-2 h-4 w-4" />
                        Add Column Before
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleAddColumnAfter}
                        className="w-full justify-start"
                    >
                        <ArrowRightToLine className="mr-2 h-4 w-4" />
                        Add Column After
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDeleteColumn}
                        className="w-full justify-start text-destructive hover:text-destructive"
                        disabled={!editorState.canDeleteColumn}
                    >
                        <div className="mr-1 h-4 w-4 flex items-center justify-center">
                            <div className="h-[1rem] w-[.4rem] -ml-1 border border-destructive rounded-xs" />
                        </div>
                        Delete Column
                    </Button>

                    <Separator className="" />

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleAddRowBefore}
                        className="w-full justify-start"
                    >
                        <ArrowUpToLine className="mr-2 h-4 w-4" />
                        Add Row Above
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleAddRowAfter}
                        className="w-full justify-start"
                    >
                        <ArrowDownToLine className="mr-2 h-4 w-4" />
                        Add Row Below
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDeleteRow}
                        className="w-full justify-start text-destructive hover:text-destructive"
                        disabled={!editorState.canDeleteRow}
                    >
                        <div className="mr-1 h-4 w-4 flex items-center justify-center">
                            <div className="h-[.4rem] w-[1rem] -ml-1 border border-destructive rounded-xs" />
                        </div>
                        Delete Row
                    </Button>
                    
                    <Separator className="" />

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSplitCell}
                        className="w-full justify-start"
                        disabled={!editorState.canSplitCell}
                    >
                        <BetweenHorizonalStart className="mr-2 h-4 w-4" />
                        Split Cell
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleMergeCells}
                        className="w-full justify-start"
                        disabled={!editorState.canMergeCells}
                    >
                        <FoldHorizontal className="mr-2 h-4 w-4" />
                        Merge Cells
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleMergeOrSplit}
                        className="w-full justify-start"
                        disabled={!editorState.canMergeOrSplit}
                    >
                        <FoldHorizontal className="mr-2 h-4 w-4" />
                        Merge or Split
                    </Button>
                    
                    <Separator className="" />

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleHeaderRow}
                        className="w-full justify-start"
                    >
                        <div className="mr-2 h-4 w-4 flex items-center justify-center rounded border border-border text-[10px] font-semibold uppercase">
                            HR
                        </div>
                        Toggle Header Row
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleHeaderColumn}
                        className="w-full justify-start"
                    >
                        <div className="mr-2 h-4 w-4 flex items-center justify-center rounded border border-border text-[10px] font-semibold uppercase">
                            HC
                        </div>
                        Toggle Header Column
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleHeaderCell}
                        className="w-full justify-start"
                    >
                        <div className="mr-2 h-4 w-4 flex items-center justify-center rounded border border-border text-[10px] font-semibold uppercase">
                            HC
                        </div>
                        Toggle Header Cell
                    </Button>

                    <Separator className="" />

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSetColspan}
                        className="w-full justify-start"
                    >
                        <div className="mr-2 h-4 w-4 flex items-center justify-center rounded border border-border text-[10px] font-semibold uppercase">
                            CS
                        </div>
                        Set Colspan
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleFixTables}
                        className="w-full justify-start"
                        disabled={!editorState.canFixTables}
                    >
                        <Hammer className="mr-2 h-4 w-4" />
                        Fix Tables
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGoToNextCell}
                        className="w-full justify-start"
                        disabled={!editorState.canGoToNextCell}
                    >
                        <MoveRight className="mr-2 h-4 w-4" />
                        Go to Next Cell
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGoToPreviousCell}
                        className="w-full justify-start"
                        disabled={!editorState.canGoToPreviousCell}
                    >
                        <MoveLeft className="mr-2 h-4 w-4" />
                        Go to Previous Cell
                    </Button>
                    
                    <Separator className="" />

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDeleteTable}
                        className="w-full justify-start text-destructive hover:text-destructive"
                    >
                        <Grid2x2X className="mr-2 h-4 w-4" />
                        Delete Table
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}

export default TableButton 