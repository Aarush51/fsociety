/**
 * The small note shown above a form when an unsaved draft was restored.
 *
 * `fileField` marks forms that also have a file or image input: the file itself
 * cannot be stored, so the note says it has to be picked again.
 */
export default function DraftRestoredNote({ onStartOver, fileField = false }) {
  return (
    <p className="draft-note muted small">
      We restored your unsaved draft.
      {fileField ? " Any file or image you picked has to be selected again." : ""}{" "}
      <button className="text-link" type="button" onClick={onStartOver}>
        Start over
      </button>
    </p>
  );
}
