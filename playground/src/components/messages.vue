<script setup lang="ts">
import { escapeLike } from '@rocicorp/zero'
import { computed, ref } from 'vue'

import { useQuery, useZero } from '~/composables/zero'
import { formatDate } from '~/utils/date'

const z = useZero()

const { data: users } = useQuery(z.query.user)
const { data: allMessages } = useQuery(z.query.message)

const filterUser = ref('')
const filterText = ref('')

const { data: filteredMessages } = useQuery(() => {
  let filtered = z.query.message
    .related('medium', medium => medium.one())
    .related('sender', sender => sender.one())
    .orderBy('timestamp', 'desc')

  if (filterUser.value) {
    filtered = filtered.where('senderID', filterUser.value)
  }

  if (filterText.value) {
    filtered = filtered.where('body', 'LIKE', `%${escapeLike(filterText.value)}%`)
  }

  return filtered
})

const hasFilters = computed(() => filterUser.value || filterText.value)

function editMessage(e: MouseEvent, id: string, senderID: string, prev: string) {
  if (senderID !== z.userID && !e.shiftKey) {
    // eslint-disable-next-line no-alert
    alert(
      'You aren\'t logged in as the sender of this message. Editing won\'t be permitted. Hold the shift key to try anyway.',
    )
    return
  }

  // eslint-disable-next-line no-alert
  const body = prompt('Edit message', prev)
  z.mutate.message.update({
    id,
    body: body ?? prev,
  })
}
</script>

<template>
  <div>
    <div class="controls">
      <div>
        From:
        <select
          v-model="filterUser"
          :style="{ flex: 1 }"
        >
          <option
            key=""
            value=""
          >
            Sender
          </option>
          <option
            v-for="choice in users"
            :key="choice.id"
            :value="choice.id"
          >
            {{ choice.name }}
          </option>
        </select>
      </div>
      <div>
        Contains:
        <input
          v-model="filterText"
          type="text"
          placeholder="message"
          :style="{ flex: 1 }"
        >
      </div>
    </div>
    <div class="controls">
      <em>
        <template v-if="!hasFilters">
          Showing all {{ filteredMessages.length }} messages
        </template>
        <template v-else>
          Showing {{ filteredMessages.length }} of {{ allMessages.length }} messages. Try opening
          <a
            href="/"
            target="_blank"
          >another tab</a> to see them all!
        </template>
      </em>
    </div>
    <template v-if="filteredMessages.length === 0">
      <h3><em>No posts found 😢</em></h3>
    </template>
    <template v-else>
      <table
        border="1"
        cellspacing="0"
        cellpadding="6"
        width="100%"
      >
        <thead>
          <tr>
            <th>Sender</th>
            <th>Medium</th>
            <th>Message</th>
            <th>Sent</th>
            <th>Edit</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="message in filteredMessages"
            :key="message.id"
          >
            <td align="left">
              {{ message.sender?.name }}
            </td>
            <td align="left">
              {{ message.medium?.name }}
            </td>
            <td align="left">
              {{ message.body }}
            </td>
            <td align="right">
              {{ formatDate(message.timestamp) }}
            </td>
            <td @mousedown="(e: MouseEvent) => editMessage(e, message.id, message.senderID, message.body)">
              ✏️
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1em;
}
</style>
