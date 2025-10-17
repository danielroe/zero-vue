<script setup lang="ts">
import { escapeLike } from '@rocicorp/zero'
import { useCookies } from '@vueuse/integrations/useCookies'

import { SignJWT } from 'jose'
import { computed, ref } from 'vue'
import { useInterval } from '~/composables/use-interval'
import { randomMessage } from '~/db/data/test-data'
import { formatDate } from '~/utils/date'
import { randInt } from '~/utils/rand'
import { useQuery, useZero } from './zero'

const cookies = useCookies()

const z = useZero()
const { data: users } = useQuery(() => z.value.query.user)
const { data: mediums } = useQuery(() => z.value.query.medium)
const { data: allMessages } = useQuery(() => z.value.query.message)

const filterUser = ref('')
const filterText = ref('')
const action = ref<'add' | 'remove' | undefined>(undefined)

const { data: filteredMessages } = useQuery(() => {
  let filtered = z.value.query.message
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

function deleteRandomMessage() {
  if (allMessages.value.length === 0) {
    return false
  }
  const index = randInt(allMessages.value.length)
  z.value.mutate.message.delete({ id: allMessages.value[index]!.id })

  return true
}

function addRandomMessage() {
  z.value.mutate.message.insert(randomMessage(users.value, mediums.value))
  return true
}

function handleAction() {
  if (action.value === 'add') {
    return addRandomMessage()
  }
  else if (action.value === 'remove') {
    return deleteRandomMessage()
  }

  return false
}

useInterval(
  () => {
    if (!handleAction()) {
      action.value = undefined
    }
  },
  action.value !== undefined ? 1000 / 60 : null,
)

const INITIAL_HOLD_DELAY_MS = 300
let holdTimer: number | null = null
function handleAddAction() {
  addRandomMessage()
  holdTimer = setTimeout(() => {
    action.value = 'add'
  }, INITIAL_HOLD_DELAY_MS)
}

function handleRemoveAction(e: MouseEvent | TouchEvent) {
  if (z.value.userID === 'anon' && 'shiftKey' in e && !e.shiftKey) {
    // eslint-disable-next-line no-alert
    alert('You must be logged in to delete. Hold shift to try anyway.')
    return
  }
  deleteRandomMessage()

  holdTimer = setTimeout(() => {
    action.value = 'remove'
  }, INITIAL_HOLD_DELAY_MS)
}

function stopAction() {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }

  action.value = undefined
}

function editMessage(e: MouseEvent, id: string, senderID: string, prev: string) {
  if (senderID !== z.value.userID && !e.shiftKey) {
    // eslint-disable-next-line no-alert
    alert(
      'You aren\'t logged in as the sender of this message. Editing won\'t be permitted. Hold the shift key to try anyway.',
    )
    return
  }

  // eslint-disable-next-line no-alert
  const body = prompt('Edit message', prev)
  z.value.mutate.message.update({
    id,
    body: body ?? prev,
  })
}

async function toggleLogin() {
  if (z.value.userID === 'anon') {
    const jwt = await new SignJWT({ sub: 'ENzoNm7g4E' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(import.meta.env.VITE_PUBLIC_AUTH_SECRET))
    cookies.set('jwt', jwt)
  }
  else {
    cookies.remove('jwt')
  }
}

const user = computed(() => users.value.find(user => user.id === z.value.userID)?.name ?? 'anon')
</script>

<template>
  <div>
    <div class="controls">
      <div>
        <button
          @mousedown="handleAddAction"
          @mouseup="stopAction"
          @mouseleave="stopAction"
          @touchstart="handleAddAction"
          @touchend="stopAction"
        >
          Add Messages
        </button>
        <button
          @mousedown="handleRemoveAction"
          @mouseup="stopAction"
          @mouseleave="stopAction"
          @touchstart="handleRemoveAction"
          @touchend="stopAction"
        >
          Remove Messages
        </button>
        <em>(hold down buttons to repeat)</em>
      </div>
      <div :style="{ justifyContent: 'end' }">
        {{ user === 'anon' ? '' : `Logged in as ${user}` }}
        <button @mousedown="toggleLogin">
          {{ user === 'anon' ? 'Login' : 'Logout' }}
        </button>
      </div>
    </div>
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
