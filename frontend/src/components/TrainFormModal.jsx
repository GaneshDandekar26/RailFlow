import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import Modal from './Modal.jsx';
import { SelectField, TextField } from './Fields.jsx';
import { useApp } from '../context/AppContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../lib/api.js';
import { validateTrain } from '../lib/validators.js';

// Shared dialog for adding a train and editing an existing one. It is mounted
// once in <Layout/> and opened through useApp().openTrainForm(train?).

function TrainFormDialog({ train, onClose }) {
  const { trains, reload } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const editing = Boolean(train);

  const [number, setNumber] = useState(train?.number ?? '');
  const [name, setName] = useState(train?.name ?? '');
  const [operational, setOperational] = useState(train?.operational ?? 'normal');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const numberRef = useRef(null);
  const nameRef = useRef(null);

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');

    const found = validateTrain(
      { number, name },
      { existingNumbers: trains.map((t) => t.number), currentNumber: train?.number ?? null },
    );
    setErrors(found);
    if (found.number) return numberRef.current?.focus();
    if (found.name) return nameRef.current?.focus();

    setBusy(true);
    try {
      if (editing) {
        const changes = {};
        if (number.trim() !== train.number) changes.number = number.trim();
        if (name.trim() !== train.name) changes.name = name.trim();
        if (operational !== train.operational) changes.operational = operational;
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        const { train: saved } = await api.updateTrain(train.number, changes);
        // If this train's route page is open and its number changed, follow it.
        if (saved.number !== train.number && location.pathname === `/routes/${train.number}`) {
          navigate(`/routes/${saved.number}`, { replace: true });
        }
        toast.success(`Train ${saved.number} updated.`);
      } else {
        const { train: created } = await api.createTrain(number.trim(), name.trim());
        toast.success(`Train ${created.number} added.`, {
          action: { label: 'Add stations', onClick: () => navigate(`/routes/${created.number}`) },
          duration: 7000,
        });
      }
      await reload();
      onClose();
    } catch (err) {
      if (err.field && ['number', 'name', 'operational'].includes(err.field)) {
        setErrors({ [err.field]: err.message });
      } else {
        setFormError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      title={editing ? `Edit train ${train.number}` : 'Add train'}
      description={
        editing
          ? 'Change the name or number, or halt the train.'
          : 'Create the train first, then add its stations on the Route Management page.'
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="train-form" className="btn btn-primary" disabled={busy}>
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {editing ? 'Save changes' : 'Add train'}
          </button>
        </>
      }
    >
      <form id="train-form" onSubmit={submit} noValidate className="space-y-4 pb-2">
        {formError && (
          <div role="alert" className="rounded-xl border border-stop-100 bg-stop-50 px-3.5 py-2.5 text-sm font-medium text-stop-700">
            {formError}
          </div>
        )}
        <TextField
          ref={numberRef}
          label="Train number"
          value={number}
          onChange={(v) => setNumber(v.replace(/\D/g, '').slice(0, 6))}
          error={errors.number}
          hint="3 to 6 digits. Each train number must be unique."
          inputMode="numeric"
          autoComplete="off"
          placeholder="12127"
        />
        <TextField
          ref={nameRef}
          label="Train name"
          value={name}
          onChange={setName}
          error={errors.name}
          autoComplete="off"
          placeholder="Mumbai-Pune Intercity"
          maxLength={60}
        />
        {editing && (
          <SelectField
            label="Operation"
            value={operational}
            onChange={setOperational}
            error={errors.operational}
            hint="Stopped and cancelled trains can't be moved along their route."
          >
            <option value="normal">Normal operation</option>
            <option value="stopped">Stopped</option>
            <option value="cancelled">Cancelled</option>
          </SelectField>
        )}
      </form>
    </Modal>
  );
}

export default function TrainFormModal() {
  const { trainForm, closeTrainForm } = useApp();
  if (!trainForm.open) return null;
  return (
    <TrainFormDialog
      key={trainForm.train ? `edit-${trainForm.train.number}` : 'new'}
      train={trainForm.train}
      onClose={closeTrainForm}
    />
  );
}
