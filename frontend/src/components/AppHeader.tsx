import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../services/api";

import "./AppHeader.css";

interface NotificationItem {
  id: number;

  userId: number;

  taskId?: number | null;

  type: string;

  title: string;

  message: string;

  isRead:
    | boolean
    | number;

  readAt?: string | null;

  createdAt: string;

  updatedAt?: string;

  taskTitle?: string | null;

  taskStatus?: string | null;
}

export default function AppHeader() {
  const navigate =
    useNavigate();

  const notificationRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const [
    notificationOpen,
    setNotificationOpen,
  ] =
    useState(false);

  const [
    notifications,
    setNotifications,
  ] =
    useState<
      NotificationItem[]
    >([]);

  const [
    unreadCount,
    setUnreadCount,
  ] =
    useState(0);

  const [
    loadingNotifications,
    setLoadingNotifications,
  ] =
    useState(false);

  const [
    notificationError,
    setNotificationError,
  ] =
    useState("");

  /* ============================================
     LOAD UNREAD COUNT
  ============================================ */

  useEffect(() => {
    loadUnreadCount();

    const interval =
      window.setInterval(
        () => {
          loadUnreadCount();
        },
        30000
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, []);

  /* ============================================
     REFRESH AFTER A DELEGATION PAGE
     CLEARS ITS NOTIFICATIONS
  ============================================ */

  useEffect(() => {
    function handleNotificationsUpdated() {
      loadUnreadCount();

      if (
        notificationOpen
      ) {
        loadNotifications();
      }
    }

    window.addEventListener(
      "notifications-updated",
      handleNotificationsUpdated
    );

    return () => {
      window.removeEventListener(
        "notifications-updated",
        handleNotificationsUpdated
      );
    };
  }, [notificationOpen]);

  /* ============================================
     CLICK OUTSIDE DROPDOWN
  ============================================ */

  useEffect(() => {
    function handleOutsideClick(
      event: MouseEvent
    ) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(
          event.target as Node
        )
      ) {
        setNotificationOpen(
          false
        );
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  /* ============================================
     UNREAD COUNT
  ============================================ */

  async function loadUnreadCount() {
    try {
      const response =
        await api.get(
          "/notifications/unread-count"
        );

      setUnreadCount(
        Number(
          response.data
            ?.unreadCount ||
            0
        )
      );

    } catch (error) {

      console.error(
        "Unable to load unread notifications",
        error
      );
    }
  }

  /* ============================================
     LOAD ONLY UNREAD NOTIFICATIONS
  ============================================ */

  async function loadNotifications() {
    setLoadingNotifications(
      true
    );

    setNotificationError("");

    try {
      const response =
        await api.get(
          "/notifications?limit=20&unreadOnly=true"
        );

      const rows =
        Array.isArray(
          response.data?.data
        )
          ? response.data.data
          : [];

      setNotifications(
        rows
      );

    } catch (error) {

      console.error(
        "Unable to load notifications",
        error
      );

      setNotificationError(
        "Unable to load notifications."
      );

    } finally {

      setLoadingNotifications(
        false
      );
    }
  }

  /* ============================================
     OPEN / CLOSE BELL
  ============================================ */

  async function toggleNotifications() {
    const willOpen =
      !notificationOpen;

    setNotificationOpen(
      willOpen
    );

    if (willOpen) {
      await Promise.all([
        loadNotifications(),
        loadUnreadCount(),
      ]);
    }
  }

  /* ============================================
     MARK ONE AS READ
  ============================================ */

  async function markAsRead(
    notificationId: number
  ) {
    try {
      await api.patch(
        `/notifications/${notificationId}/read`
      );

      setNotifications(
        (current) =>
          current.filter(
            (notification) =>
              notification.id !==
              notificationId
          )
      );

      await loadUnreadCount();

    } catch (error) {

      console.error(
        "Unable to mark notification as read",
        error
      );
    }
  }

  /* ============================================
     OPEN NOTIFICATION

     If linked to a delegation,
     clear ALL unread notifications for
     that delegation before opening it.
  ============================================ */

  async function openNotification(
    notification: NotificationItem
  ) {
    try {
      if (
        notification.taskId
      ) {
        await api.patch(
          `/notifications/task/${notification.taskId}/read`
        );

        setNotifications(
          (current) =>
            current.filter(
              (item) =>
                Number(
                  item.taskId
                ) !==
                Number(
                  notification.taskId
                )
            )
        );

        await loadUnreadCount();

        setNotificationOpen(
          false
        );

        navigate(
          `/tasks/${notification.taskId}`
        );

        return;
      }

      await markAsRead(
        notification.id
      );

    } catch (error) {

      console.error(
        "Unable to open notification",
        error
      );
    }
  }

  /* ============================================
     CLEAR NOTIFICATIONS

     Clears every unread notification
     for the logged-in user.
  ============================================ */

  async function clearNotifications() {
    try {
      await api.patch(
        "/notifications/read-all"
      );

      setNotifications([]);

      setUnreadCount(0);

    } catch (error) {

      console.error(
        "Unable to clear notifications",
        error
      );
    }
  }

  /* ============================================
     TIME DISPLAY
  ============================================ */

  function formatNotificationTime(
    value: string
  ) {
    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    const now =
      new Date();

    const difference =
      now.getTime() -
      date.getTime();

    const minutes =
      Math.floor(
        difference /
          60000
      );

    if (
      minutes >= 0 &&
      minutes < 1
    ) {
      return "Just now";
    }

    if (
      minutes >= 1 &&
      minutes < 60
    ) {
      return `${minutes} min ago`;
    }

    const hours =
      Math.floor(
        minutes / 60
      );

    if (
      hours >= 1 &&
      hours < 24
    ) {
      return `${hours} hr ago`;
    }

    return date.toLocaleString(
      undefined,
      {
        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric",

        hour:
          "numeric",

        minute:
          "2-digit",
      }
    );
  }

  /* ============================================
     LOGOUT
  ============================================ */

  async function logout() {
    try {
      await api.post(
        "/auth/logout"
      );

    } finally {

      navigate("/");
    }
  }

  return (
    <header className="app-fixed-header">

      {/* BRAND */}

      <div
        className="app-header-brand"
        onClick={() =>
          navigate(
            "/dashboard"
          )
        }
      >

        <div className="app-header-logo">

          <img
            src="/prorich-mark.png"
            alt="Prorich Agro"
          />

        </div>

        <div className="app-header-brand-text">

          <strong>
            Delegation Management
          </strong>

          <span>
            Prorich Agro Pvt Ltd
          </span>

        </div>

      </div>

      {/* RIGHT SIDE */}

      <div className="app-header-actions">

        <div
          className="notification-wrapper"
          ref={notificationRef}
        >

          <button
            type="button"
            className={
              notificationOpen
                ? "notification-bell active"
                : "notification-bell"
            }
            onClick={
              toggleNotifications
            }
            aria-label="Notifications"
          >

            <span className="notification-bell-icon">
              🔔
            </span>

            {unreadCount >
              0 && (

              <span className="notification-count">

                {unreadCount >
                99
                  ? "99+"
                  : unreadCount}

              </span>

            )}

          </button>

          {notificationOpen && (

            <div className="notification-dropdown">

              <div className="notification-dropdown-header">

                <div>

                  <strong>
                    Notifications
                  </strong>

                  <span>
                    {unreadCount >
                    0
                      ? `${unreadCount} unread`
                      : "You're all caught up"}
                  </span>

                </div>

                {notifications.length >
                  0 && (

                  <button
                    type="button"
                    className="notification-read-all"
                    onClick={
                      clearNotifications
                    }
                  >
                    Clear Notifications
                  </button>

                )}

              </div>

              <div className="notification-list">

                {loadingNotifications && (

                  <div className="notification-state">
                    Loading notifications...
                  </div>

                )}

                {!loadingNotifications &&
                  notificationError && (

                  <div className="notification-state notification-state-error">

                    {
                      notificationError
                    }

                  </div>

                )}

                {!loadingNotifications &&
                  !notificationError &&
                  notifications.length ===
                    0 && (

                  <div className="notification-empty">

                    <div className="notification-empty-icon">
                      🔔
                    </div>

                    <strong>
                      No notifications
                    </strong>

                    <span>
                      New delegation updates will appear here.
                    </span>

                  </div>

                )}

                {!loadingNotifications &&
                  !notificationError &&
                  notifications.map(
                    (
                      notification
                    ) => (

                      <button
                        type="button"
                        key={
                          notification.id
                        }
                        className="notification-item unread"
                        onClick={() =>
                          openNotification(
                            notification
                          )
                        }
                      >

                        <div className="notification-item-top">

                          <strong>
                            {
                              notification.title
                            }
                          </strong>

                          <span className="notification-unread-dot" />

                        </div>

                        <p>
                          {
                            notification.message
                          }
                        </p>

                        <div className="notification-item-bottom">

                          {notification.taskId && (

                            <span className="notification-task-id">

                              Delegation #
                              {
                                notification.taskId
                              }

                            </span>

                          )}

                          <span className="notification-time">

                            {formatNotificationTime(
                              notification.createdAt
                            )}

                          </span>

                        </div>

                      </button>

                    )
                  )}

              </div>

            </div>

          )}

        </div>

        <button
          type="button"
          className="header-logout"
          onClick={logout}
        >
          Logout
        </button>

      </div>

    </header>
  );
}
