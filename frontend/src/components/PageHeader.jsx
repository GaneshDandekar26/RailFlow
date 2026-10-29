import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Plus, Search } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { formatToday } from '../lib/format.js';

export default function PageHeader({ title, description, showSearch = true, children }) {
  const { openTrainForm } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const submitSearch = (event) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/trains?q=${encodeURIComponent(q)}` : '/trains');
  };

  return (
    <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0 xl:flex-1">
        <h1 className="text-[30px] font-semibold leading-tight text-ink">{title}</h1>
        <p className="mt-1 max-w-xl text-[15px] text-ink-500">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 xl:shrink-0">
        <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-medium text-ink-700">
          <CalendarDays className="h-4 w-4 text-ink-400" aria-hidden="true" />
          {formatToday()}
        </span>
        {showSearch && (
          <form onSubmit={submitSearch} role="search" className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search trains"
              aria-label="Search trains by number or name"
              className="input w-48 pl-9 sm:w-56"
            />
          </form>
        )}
        {children}
        <button type="button" className="btn btn-primary" onClick={() => openTrainForm()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add train
        </button>
      </div>
    </header>
  );
}
