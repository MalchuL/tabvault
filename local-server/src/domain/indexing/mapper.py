"""Mappings for vector index scheduling."""

from models import HealthSchedule

from .dto import HealthScheduleDTO


class IndexingMapper:
    """Map persisted index scheduling state."""

    @staticmethod
    def schedule(schedule: HealthSchedule) -> HealthScheduleDTO:
        """Convert a schedule row to its wire DTO.

        Args:
            schedule (HealthSchedule): Current persisted health-check schedule.

        Returns:
            HealthScheduleDTO: Configured interval and latest check or alert state.
        """
        return HealthScheduleDTO(
            enabled=schedule.interval_seconds > 0,
            interval_seconds=schedule.interval_seconds,
            notify_on_needs_attention=schedule.notify_on_needs_attention,
            last_check=schedule.last_check,
            last_result=schedule.last_result,
            last_alert=schedule.last_alert,
        )
