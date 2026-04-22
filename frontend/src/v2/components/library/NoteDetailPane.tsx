import { NoteEditor } from '../../../components/NoteEditor'
import type { NoteDetail } from '../../../types/note'

interface Props {
  noteId: string
  onChanged: (note: NoteDetail) => void
  onDeleted: (noteId: string) => void
  onClose: () => void
}

/** Wraps the existing NoteEditor so it fills the detail pane in Library. */
export function NoteDetailPane({ noteId, onChanged, onDeleted, onClose }: Props) {
  return (
    <div className="h-full overflow-auto">
      <NoteEditor
        noteId={noteId}
        onClose={onClose}
        onSaved={(note) => onChanged(note)}
        onDeleted={(id) => onDeleted(id)}
      />
    </div>
  )
}
