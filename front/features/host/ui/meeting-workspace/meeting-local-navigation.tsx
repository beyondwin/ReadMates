import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { HostMeetingTask, HostMeetingTaskLink } from "@/features/host/model/host-session-workspace-model";

export type MeetingLinkProps = {
  to: string;
  className?: string;
  "aria-current"?: "page";
  onClick?: () => void;
  children: ReactNode;
};

const focusableSelector = "a[href],button:not([disabled]),[tabindex]:not([tabindex='-1'])";

function defaultLink({ to, children, ...props }: MeetingLinkProps) {
  return <a href={to} {...props}>{children}</a>;
}

function TaskNav({
  tasks,
  activeTask,
  label,
  LinkComponent,
  onActivate,
}: {
  tasks: ReadonlyArray<HostMeetingTaskLink>;
  activeTask: HostMeetingTask;
  label: string;
  LinkComponent: ComponentType<MeetingLinkProps>;
  onActivate: (task: HostMeetingTask) => void;
}) {
  return (
    <nav aria-label={label} className="rm-meeting-local-nav__nav">
      <ul className="rm-meeting-local-nav__list">
        {tasks.map((item) => (
          <li key={item.task}>
            <LinkComponent
              to={item.href}
              className="rm-meeting-local-nav__link"
              aria-current={item.task === activeTask ? "page" : undefined}
              onClick={() => onActivate(item.task)}
            >
              <span>{item.label}</span>
              {item.badge ? <span className="rm-meeting-local-nav__badge">{item.badge}</span> : null}
            </LinkComponent>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MeetingLocalNavigation({
  tasks,
  activeTask,
  onTaskLinkActivated,
  LinkComponent = defaultLink,
}: {
  tasks: ReadonlyArray<HostMeetingTaskLink>;
  activeTask: HostMeetingTask;
  onTaskLinkActivated: (task: HostMeetingTask) => void;
  LinkComponent?: ComponentType<MeetingLinkProps>;
}) {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined"
    && window.matchMedia?.("(max-width: 767px)").matches);
  const [overflow, setOverflow] = useState(false);
  const [open, setOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 767px)");
    const update = () => setMobile(Boolean(media?.matches));
    update();
    media?.addEventListener?.("change", update);
    return () => media?.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const element = stripRef.current;
    if (!element || mobile) return;
    const measure = () => {
      if (window.matchMedia?.("(min-width: 1120px)").matches) {
        setOverflow(false);
        return;
      }
      const requiredWidth = Math.max(element.scrollWidth, measureRef.current?.scrollWidth ?? 0);
      setOverflow(requiredWidth > element.clientWidth + 1);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mobile, tasks]);

  useEffect(() => {
    if (!open) return;
    const first = overlayRef.current?.querySelector<HTMLElement>(focusableSelector);
    first?.focus();
  }, [open]);

  const close = (restore = true) => {
    setOpen(false);
    if (restore) triggerRef.current?.focus();
  };
  const activate = (task: HostMeetingTask) => {
    if (open) close(false);
    onTaskLinkActivated(task);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!mobile || event.key !== "Tab" || !overlayRef.current) return;
    const focusable = Array.from(overlayRef.current.querySelectorAll<HTMLElement>(focusableSelector));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const collapsed = mobile || overflow;
  return (
    <div className={`rm-meeting-local-nav${collapsed ? " is-collapsed" : ""}`}>
      <div ref={measureRef} className="rm-meeting-local-nav__measure" aria-hidden="true">
        {tasks.map((item) => <span key={item.task}>{item.label}{item.badge ? ` ${item.badge}` : ""}</span>)}
      </div>
      <div ref={stripRef} data-testid="meeting-task-strip" className="rm-meeting-local-nav__strip">
        {!collapsed ? (
          <TaskNav
            tasks={tasks}
            activeTask={activeTask}
            label="현재 모임 작업"
            LinkComponent={LinkComponent}
            onActivate={activate}
          />
        ) : (
          <button
            ref={triggerRef}
            type="button"
            className="rm-meeting-local-nav__trigger"
            aria-label="모임 작업 목차"
            aria-expanded={open}
            aria-haspopup={mobile ? "dialog" : "menu"}
            onClick={() => setOpen((current) => !current)}
          >
            <span>모임 작업 목차</span>
            <span className="rm-meeting-local-nav__current">
              {tasks.find((item) => item.task === activeTask)?.label ?? "개요"}
            </span>
          </button>
        )}
      </div>

      {open ? (
        <div
          className={mobile ? "rm-meeting-local-nav__backdrop" : "rm-meeting-local-nav__popover-wrap"}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={overlayRef}
            className={mobile ? "rm-meeting-local-nav__sheet" : "rm-meeting-local-nav__popover"}
            role={mobile ? "dialog" : "region"}
            aria-modal={mobile ? "true" : undefined}
            aria-label="모임 작업 목차"
            onKeyDown={onKeyDown}
          >
            <div className="rm-meeting-local-nav__overlay-head">
              <strong>모임 작업 목차</strong>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => close()}>닫기</button>
            </div>
            <TaskNav
              tasks={tasks}
              activeTask={activeTask}
              label="모임 작업 목차"
              LinkComponent={LinkComponent}
              onActivate={activate}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
